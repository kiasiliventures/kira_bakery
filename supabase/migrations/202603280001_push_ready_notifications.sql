begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscription_orders (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscription_id, order_id)
);

create table if not exists public.push_notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  notification_type text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_updated_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  subscription_count integer not null default 0,
  success_count integer not null default 0,
  stale_subscription_count integer not null default 0
);

create index if not exists push_subscription_orders_order_id_idx
  on public.push_subscription_orders(order_id);

create index if not exists push_notification_dispatches_order_id_idx
  on public.push_notification_dispatches(order_id);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_subscription_orders enable row level security;
alter table public.push_notification_dispatches enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

commit;
