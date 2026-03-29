begin;

alter table public.orders
  add column if not exists inventory_deducted_at timestamptz,
  add column if not exists fulfillment_review_required boolean,
  add column if not exists fulfillment_review_reason text,
  add column if not exists inventory_conflict boolean,
  add column if not exists inventory_deduction_status text,
  add column if not exists inventory_deduction_attempted_at timestamptz;

update public.orders
set
  fulfillment_review_required = coalesce(fulfillment_review_required, false),
  inventory_conflict = coalesce(inventory_conflict, false),
  inventory_deduction_status = coalesce(nullif(trim(inventory_deduction_status), ''), 'not_started')
where fulfillment_review_required is null
   or inventory_conflict is null
   or inventory_deduction_status is null
   or nullif(trim(inventory_deduction_status), '') is null;

alter table public.orders
  alter column fulfillment_review_required set default false,
  alter column fulfillment_review_required set not null,
  alter column inventory_conflict set default false,
  alter column inventory_conflict set not null,
  alter column inventory_deduction_status set default 'not_started',
  alter column inventory_deduction_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_inventory_deduction_status_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_inventory_deduction_status_chk
      check (
        inventory_deduction_status in (
          'not_started',
          'processing',
          'completed',
          'partial_conflict',
          'conflict',
          'review_required'
        )
      );
  end if;
end
$$;

create index if not exists orders_fulfillment_review_required_idx
  on public.orders(fulfillment_review_required)
  where fulfillment_review_required = true;

create index if not exists orders_inventory_conflict_idx
  on public.orders(inventory_conflict)
  where inventory_conflict = true;

create index if not exists orders_inventory_deduction_status_idx
  on public.orders(inventory_deduction_status);

alter table public.order_items
  add column if not exists inventory_allocation_status text,
  add column if not exists inventory_deducted_quantity integer,
  add column if not exists inventory_conflict_quantity integer,
  add column if not exists inventory_conflict_reason text,
  add column if not exists inventory_deducted_at timestamptz;

update public.order_items
set
  inventory_allocation_status = coalesce(nullif(trim(inventory_allocation_status), ''), 'pending'),
  inventory_deducted_quantity = coalesce(inventory_deducted_quantity, 0),
  inventory_conflict_quantity = coalesce(inventory_conflict_quantity, 0)
where inventory_allocation_status is null
   or nullif(trim(inventory_allocation_status), '') is null
   or inventory_deducted_quantity is null
   or inventory_conflict_quantity is null;

alter table public.order_items
  alter column inventory_allocation_status set default 'pending',
  alter column inventory_allocation_status set not null,
  alter column inventory_deducted_quantity set default 0,
  alter column inventory_deducted_quantity set not null,
  alter column inventory_conflict_quantity set default 0,
  alter column inventory_conflict_quantity set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_inventory_allocation_status_chk'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_inventory_allocation_status_chk
      check (
        inventory_allocation_status in (
          'pending',
          'allocated',
          'partial_conflict',
          'conflict'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_inventory_quantities_chk'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_inventory_quantities_chk
      check (
        inventory_deducted_quantity >= 0
        and inventory_conflict_quantity >= 0
        and inventory_deducted_quantity + inventory_conflict_quantity <= quantity
      );
  end if;
end
$$;

create index if not exists order_items_inventory_allocation_status_idx
  on public.order_items(order_id, inventory_allocation_status);

create or replace function public.sync_order_payment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_state text := lower(trim(coalesce(new.payment_status, '')));
  status_state text := lower(trim(coalesce(new.status, '')));
  transition_time timestamptz := now();
begin
  if payment_state in ('paid', 'completed') then
    if status_state not in ('ready', 'completed', 'cancelled') then
      new.status := 'Paid';
    end if;

    if lower(trim(coalesce(new.order_status, ''))) not in ('ready', 'completed', 'cancelled') then
      new.order_status := 'paid';
    end if;

    new.paid_at := coalesce(new.paid_at, transition_time);
    new.inventory_deduction_status := coalesce(
      nullif(trim(coalesce(new.inventory_deduction_status, '')), ''),
      'not_started'
    );

    return new;
  end if;

  if payment_state in ('failed', 'payment_failed', 'reversed') then
    if status_state not in ('ready', 'completed', 'cancelled') then
      new.status := 'Payment Failed';
    end if;

    if lower(trim(coalesce(new.order_status, ''))) not in ('ready', 'completed', 'cancelled') then
      new.order_status := 'payment_failed';
    end if;

    return new;
  end if;

  if payment_state in ('cancelled', 'canceled', 'invalid') then
    if status_state <> 'completed' then
      new.status := 'Cancelled';
    end if;

    if lower(trim(coalesce(new.order_status, ''))) <> 'completed' then
      new.order_status := 'cancelled';
    end if;

    return new;
  end if;

  if status_state not in ('paid', 'ready', 'completed', 'cancelled', 'payment failed') then
    new.status := 'Pending Payment';
  end if;

  if lower(trim(coalesce(new.order_status, ''))) not in ('paid', 'ready', 'completed', 'cancelled', 'payment_failed') then
    new.order_status := 'pending_payment';
  end if;

  return new;
end;
$$;

create or replace function public.attempt_paid_order_inventory_deduction(
  p_order_id uuid
)
returns table (
  inventory_deduction_status text,
  fulfillment_review_required boolean,
  fulfillment_review_reason text,
  inventory_conflict boolean,
  reserved_item_count integer,
  conflicted_item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_order public.orders%rowtype;
  item_record public.order_items%rowtype;
  product_record public.products%rowtype;
  attempted_at timestamptz := now();
  remaining_quantity integer;
  allocated_quantity integer;
  conflict_quantity integer;
  resolved_status text;
  resolved_reason text;
begin
  select *
    into existing_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  if lower(trim(coalesce(existing_order.payment_status, ''))) not in ('paid', 'completed') then
    raise exception 'only paid orders can deduct inventory';
  end if;

  if coalesce(existing_order.inventory_deduction_status, 'not_started') in (
    'completed',
    'partial_conflict',
    'conflict',
    'review_required'
  ) then
    return query
    select
      existing_order.inventory_deduction_status,
      existing_order.fulfillment_review_required,
      existing_order.fulfillment_review_reason,
      existing_order.inventory_conflict,
      coalesce((
        select count(*)::integer
        from public.order_items
        where order_id = p_order_id
          and inventory_allocation_status = 'allocated'
      ), 0),
      coalesce((
        select count(*)::integer
        from public.order_items
        where order_id = p_order_id
          and inventory_allocation_status in ('partial_conflict', 'conflict')
      ), 0);
    return;
  end if;

  update public.orders
  set
    inventory_deduction_status = 'processing',
    inventory_deduction_attempted_at = attempted_at
  where id = p_order_id;

  for item_record in
    select *
    from public.order_items
    where order_id = p_order_id
    order by created_at asc, id asc
    for update
  loop
    if item_record.inventory_allocation_status <> 'pending' then
      continue;
    end if;

    remaining_quantity := greatest(
      item_record.quantity
      - coalesce(item_record.inventory_deducted_quantity, 0)
      - coalesce(item_record.inventory_conflict_quantity, 0),
      0
    );

    if remaining_quantity = 0 then
      continue;
    end if;

    allocated_quantity := 0;
    conflict_quantity := remaining_quantity;

    if item_record.product_id is null then
      conflict_quantity := remaining_quantity;
    else
      select *
        into product_record
      from public.products
      where id = item_record.product_id
      for update;

      if found and coalesce(product_record.is_available, true) then
        allocated_quantity := least(greatest(coalesce(product_record.stock_quantity, 0), 0), remaining_quantity);
        conflict_quantity := remaining_quantity - allocated_quantity;

        if allocated_quantity > 0 then
          update public.products
          set stock_quantity = stock_quantity - allocated_quantity
          where id = item_record.product_id;
        end if;
      end if;
    end if;

    update public.order_items
    set
      inventory_deducted_quantity = inventory_deducted_quantity + allocated_quantity,
      inventory_conflict_quantity = inventory_conflict_quantity + conflict_quantity,
      inventory_allocation_status = case
        when conflict_quantity = 0 then 'allocated'
        when allocated_quantity > 0 then 'partial_conflict'
        else 'conflict'
      end,
      inventory_conflict_reason = case
        when conflict_quantity > 0 then 'Insufficient stock during paid-order inventory deduction.'
        else null
      end,
      inventory_deducted_at = case
        when allocated_quantity > 0 then coalesce(inventory_deducted_at, attempted_at)
        else inventory_deducted_at
      end
    where id = item_record.id;
  end loop;

  select
    case
      when count(*) filter (where inventory_allocation_status in ('partial_conflict', 'conflict')) > 0
        and count(*) filter (where inventory_allocation_status = 'allocated') > 0
        then 'partial_conflict'
      when count(*) filter (where inventory_allocation_status in ('partial_conflict', 'conflict')) > 0
        then 'conflict'
      else 'completed'
    end,
    case
      when count(*) filter (where inventory_allocation_status in ('partial_conflict', 'conflict')) > 0
        and count(*) filter (where inventory_allocation_status = 'allocated') > 0
        then 'Payment succeeded and some stock was reserved, but one or more items could not be fully deducted.'
      when count(*) filter (where inventory_allocation_status in ('partial_conflict', 'conflict')) > 0
        then 'Payment succeeded, but stock could not be deducted for one or more items.'
      else null
    end,
    count(*) filter (where inventory_allocation_status = 'allocated')::integer,
    count(*) filter (where inventory_allocation_status in ('partial_conflict', 'conflict'))::integer
    into resolved_status, resolved_reason, reserved_item_count, conflicted_item_count
  from public.order_items
  where order_id = p_order_id;

  update public.orders
  set
    fulfillment_review_required = conflicted_item_count > 0,
    fulfillment_review_reason = resolved_reason,
    inventory_conflict = conflicted_item_count > 0,
    inventory_deduction_status = resolved_status,
    inventory_deduction_attempted_at = attempted_at,
    inventory_deducted_at = case
      when conflicted_item_count = 0 then coalesce(inventory_deducted_at, attempted_at)
      else inventory_deducted_at
    end
  where id = p_order_id
  returning
    orders.inventory_deduction_status,
    orders.fulfillment_review_required,
    orders.fulfillment_review_reason,
    orders.inventory_conflict
  into inventory_deduction_status, fulfillment_review_required, fulfillment_review_reason, inventory_conflict;

  return next;
end;
$$;

revoke all on function public.attempt_paid_order_inventory_deduction(uuid) from public, anon, authenticated;
grant execute on function public.attempt_paid_order_inventory_deduction(uuid) to service_role;

create or replace function public.admin_transition_order_status(
  p_order_id uuid,
  p_next_status text,
  p_expected_updated_at timestamptz default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_order public.orders%rowtype;
  transition_time timestamptz := now();
  requested_status text := lower(trim(coalesce(p_next_status, '')));
begin
  if not public.has_role(array['admin'::public.app_role, 'manager'::public.app_role, 'staff'::public.app_role]) then
    raise exception 'insufficient permissions';
  end if;

  select *
    into existing_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  if p_expected_updated_at is not null and existing_order.updated_at <> p_expected_updated_at then
    raise exception 'order was modified concurrently';
  end if;

  if lower(trim(coalesce(existing_order.status, ''))) = requested_status then
    return existing_order;
  end if;

  if requested_status = 'ready' then
    if existing_order.status <> 'Paid' then
      raise exception 'only paid orders can move to ready';
    end if;

    if existing_order.fulfillment_review_required then
      raise exception 'order requires fulfillment review before moving to ready';
    end if;

    if existing_order.inventory_deduction_status <> 'completed' then
      raise exception 'inventory must be deducted successfully before moving to ready';
    end if;

    update public.orders
    set
      status = 'Ready',
      order_status = 'ready',
      updated_at = transition_time
    where id = p_order_id
    returning * into existing_order;

    return existing_order;
  end if;

  if requested_status = 'completed' then
    if existing_order.status <> 'Ready' then
      raise exception 'only ready orders can move to completed';
    end if;

    update public.orders
    set
      status = 'Completed',
      order_status = 'completed',
      updated_at = transition_time
    where id = p_order_id
    returning * into existing_order;

    return existing_order;
  end if;

  if requested_status = 'cancelled' then
    if not public.has_role(array['admin'::public.app_role, 'manager'::public.app_role]) then
      raise exception 'only admin or manager can cancel orders';
    end if;

    if existing_order.status = 'Completed' then
      raise exception 'completed orders cannot be cancelled';
    end if;

    update public.orders
    set
      status = 'Cancelled',
      order_status = 'cancelled',
      updated_at = transition_time
    where id = p_order_id
    returning * into existing_order;

    return existing_order;
  end if;

  raise exception 'unsupported order status transition';
end;
$$;

grant execute on function public.admin_transition_order_status(uuid, text, timestamptz) to authenticated;

commit;
