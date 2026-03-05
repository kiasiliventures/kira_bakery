-- Kira Bakery initial schema for Supabase Postgres
-- Run in Supabase SQL Editor or via migration tooling.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'product_category') then
    create type public.product_category as enum ('Bread', 'Cakes', 'Pastries', 'Others');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('Pending', 'In Progress', 'Ready', 'Delivered');
  end if;
end
$$;

create table if not exists public.products (
  id text primary key,
  name text not null check (char_length(name) >= 2),
  description text not null check (char_length(description) >= 8),
  category public.product_category not null,
  price_ugx integer not null check (price_ugx >= 3000),
  image text not null,
  sold_out boolean not null default false,
  featured boolean not null default false,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  total_ugx integer not null check (total_ugx >= 0),
  status public.order_status not null default 'Pending',
  delivery_method text not null check (delivery_method in ('delivery', 'pickup')),
  customer_name text not null check (char_length(customer_name) >= 2),
  phone text not null check (phone ~ '^\+?[0-9]{9,15}$'),
  email text,
  address text,
  delivery_date date,
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_delivery_requirements_chk check (
    delivery_method = 'pickup'
    or (address is not null and length(trim(address)) >= 5 and delivery_date is not null)
  )
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  name text not null,
  image text not null,
  price_ugx integer not null check (price_ugx >= 0),
  quantity integer not null check (quantity > 0),
  selected_size text,
  selected_flavor text,
  created_at timestamptz not null default now()
);

create table if not exists public.cake_requests (
  id text primary key,
  order_id text unique references public.orders(id) on delete cascade,
  flavor text not null check (char_length(flavor) >= 1),
  size text not null check (char_length(size) >= 1),
  message text not null check (char_length(message) between 2 and 120),
  event_date date not null,
  budget_min integer not null check (budget_min >= 50000),
  budget_max integer not null check (budget_max >= 60000 and budget_max >= budget_min),
  reference_image_name text,
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products(category);
create index if not exists products_sold_out_idx on public.products(sold_out);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists cake_requests_event_date_idx on public.cake_requests(event_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.cake_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'products_public_read'
  ) then
    create policy products_public_read
      on public.products
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

commit;
