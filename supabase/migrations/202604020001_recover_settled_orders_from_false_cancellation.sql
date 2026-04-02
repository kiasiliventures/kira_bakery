create or replace function public.sync_order_payment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_state text := lower(trim(coalesce(new.payment_status, '')));
  status_state text := lower(trim(coalesce(new.status, '')));
  order_status_state text := lower(trim(coalesce(new.order_status, '')));
  inventory_state text := lower(trim(coalesce(new.inventory_deduction_status, '')));
  transition_time timestamptz := now();
  has_settlement_evidence boolean :=
    new.inventory_deducted_at is not null
    or inventory_state in ('completed', 'partial_conflict', 'conflict', 'review_required');
begin
  if payment_state in ('paid', 'completed') then
    if status_state not in ('ready', 'completed')
      and (status_state <> 'cancelled' or has_settlement_evidence) then
      new.status := 'Paid';
    end if;

    if order_status_state not in ('ready', 'completed')
      and (order_status_state <> 'cancelled' or has_settlement_evidence) then
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

    if order_status_state not in ('ready', 'completed', 'cancelled') then
      new.order_status := 'payment_failed';
    end if;

    return new;
  end if;

  if payment_state in ('cancelled', 'canceled', 'invalid') then
    if has_settlement_evidence then
      return new;
    end if;

    if status_state <> 'completed' then
      new.status := 'Cancelled';
    end if;

    if order_status_state <> 'completed' then
      new.order_status := 'cancelled';
    end if;

    return new;
  end if;

  if status_state not in ('paid', 'ready', 'completed', 'cancelled', 'payment failed') then
    new.status := 'Pending Payment';
  end if;

  if order_status_state not in ('paid', 'ready', 'completed', 'cancelled', 'payment_failed') then
    new.order_status := 'pending_payment';
  end if;

  return new;
end;
$$;

update public.orders
set
  status = case
    when lower(trim(coalesce(status, ''))) in ('ready', 'completed') then status
    else 'Paid'
  end,
  order_status = case
    when lower(trim(coalesce(status, ''))) = 'completed' then 'completed'
    when lower(trim(coalesce(status, ''))) = 'ready' then 'ready'
    else 'paid'
  end
where lower(trim(coalesce(payment_status, ''))) in ('paid', 'completed')
  and (
    inventory_deducted_at is not null
    or lower(trim(coalesce(inventory_deduction_status, ''))) in (
      'completed',
      'partial_conflict',
      'conflict',
      'review_required'
    )
  )
  and (
    lower(trim(coalesce(status, ''))) = 'cancelled'
    or lower(trim(coalesce(order_status, ''))) = 'cancelled'
  );
