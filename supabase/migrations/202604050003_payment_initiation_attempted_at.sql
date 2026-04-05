begin;

alter table public.orders
  add column if not exists payment_initiation_attempted_at timestamptz;

create index if not exists orders_payment_initiation_attempted_at_idx
  on public.orders(payment_initiation_attempted_at)
  where payment_initiation_attempted_at is not null;

commit;
