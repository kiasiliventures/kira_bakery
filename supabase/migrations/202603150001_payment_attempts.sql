begin;

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  provider_reference text not null,
  amount integer not null check (amount >= 0),
  currency text not null default 'UGX',
  status text not null,
  redirect_url text,
  raw_provider_response jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create unique index if not exists payment_attempts_provider_reference_uidx
  on public.payment_attempts(provider, provider_reference);

create index if not exists payment_attempts_order_created_idx
  on public.payment_attempts(order_id, created_at desc);

create index if not exists payment_attempts_status_idx
  on public.payment_attempts(status);

alter table public.payment_attempts enable row level security;

insert into public.payment_attempts (
  order_id,
  provider,
  provider_reference,
  amount,
  currency,
  status,
  redirect_url,
  raw_provider_response,
  created_at,
  verified_at
)
select
  o.id,
  coalesce(nullif(trim(o.payment_provider), ''), 'pesapal'),
  o.order_tracking_id,
  coalesce(o.total_ugx, o.total_price, 0),
  'UGX',
  coalesce(nullif(trim(o.payment_status), ''), 'pending'),
  o.payment_redirect_url,
  jsonb_build_object(
    'backfilled_from_orders', true,
    'payment_reference', o.payment_reference,
    'paid_at', o.paid_at
  ),
  o.created_at,
  o.paid_at
from public.orders o
where o.order_tracking_id is not null
on conflict (provider, provider_reference) do nothing;

commit;
