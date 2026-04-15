begin;

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

    if coalesce(existing_order.inventory_deduction_status, 'not_started') <> 'completed' then
      perform *
      from public.attempt_paid_order_inventory_deduction(p_order_id);

      select *
        into existing_order
      from public.orders
      where id = p_order_id
      for update;
    end if;

    if existing_order.fulfillment_review_required then
      raise exception 'order requires fulfillment review before moving to ready';
    end if;

    if coalesce(existing_order.inventory_deduction_status, 'not_started') <> 'completed' then
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
