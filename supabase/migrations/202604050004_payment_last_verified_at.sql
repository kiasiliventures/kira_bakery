begin;

alter table public.orders
  add column if not exists payment_last_verified_at timestamptz;

create index if not exists orders_payment_last_verified_at_idx
  on public.orders(payment_last_verified_at)
  where payment_last_verified_at is not null;

commit;
