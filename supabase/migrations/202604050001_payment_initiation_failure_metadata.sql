begin;

alter table public.orders
  add column if not exists payment_initiation_failure_code text,
  add column if not exists payment_initiation_failure_message text,
  add column if not exists payment_initiation_failed_at timestamptz;

create index if not exists orders_payment_initiation_failed_at_idx
  on public.orders(payment_initiation_failed_at)
  where payment_initiation_failed_at is not null;

commit;
