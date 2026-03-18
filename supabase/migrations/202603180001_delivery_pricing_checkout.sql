begin;

create table if not exists public.store_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address_text text not null,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_pricing_configs (
  id uuid primary key default gen_random_uuid(),
  store_location_id uuid not null references public.store_locations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  max_delivery_distance_km numeric(8, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_pricing_brackets (
  id uuid primary key default gen_random_uuid(),
  pricing_config_id uuid not null references public.delivery_pricing_configs(id) on delete cascade,
  min_distance_km numeric(8, 2) not null,
  max_distance_km numeric(8, 2) not null,
  fee integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists delivery_pricing_configs_store_name_idx
  on public.delivery_pricing_configs(store_location_id, name);

create unique index if not exists delivery_pricing_configs_one_active_per_store_idx
  on public.delivery_pricing_configs(store_location_id)
  where is_active;

create unique index if not exists delivery_pricing_brackets_range_idx
  on public.delivery_pricing_brackets(pricing_config_id, min_distance_km, max_distance_km);

create index if not exists delivery_pricing_brackets_sort_order_idx
  on public.delivery_pricing_brackets(pricing_config_id, sort_order);

create index if not exists store_locations_active_idx
  on public.store_locations(is_active);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_pricing_brackets_distance_range_chk'
  ) then
    alter table public.delivery_pricing_brackets
      add constraint delivery_pricing_brackets_distance_range_chk
      check (min_distance_km <= max_distance_km);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_pricing_brackets_fee_chk'
  ) then
    alter table public.delivery_pricing_brackets
      add constraint delivery_pricing_brackets_fee_chk
      check (fee >= 0);
  end if;
end
$$;

alter table public.orders
  add column if not exists fulfillment_method text,
  add column if not exists delivery_address_text text,
  add column if not exists delivery_place_id text,
  add column if not exists delivery_latitude numeric(10, 7),
  add column if not exists delivery_longitude numeric(10, 7),
  add column if not exists delivery_distance_km numeric(8, 2),
  add column if not exists delivery_fee integer,
  add column if not exists delivery_pricing_config_id uuid references public.delivery_pricing_configs(id) on delete set null,
  add column if not exists delivery_store_location_id uuid references public.store_locations(id) on delete set null;

update public.orders
set
  fulfillment_method = coalesce(fulfillment_method, delivery_method, 'pickup'),
  delivery_address_text = coalesce(delivery_address_text, delivery_address, address),
  delivery_fee = coalesce(delivery_fee, 0)
where
  fulfillment_method is null
  or delivery_address_text is null
  or delivery_fee is null;

alter table public.orders
  alter column fulfillment_method set default 'pickup',
  alter column delivery_fee set default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_method_chk'
  ) then
    alter table public.orders
      add constraint orders_fulfillment_method_chk
      check (fulfillment_method in ('pickup', 'delivery'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_delivery_fee_chk'
  ) then
    alter table public.orders
      add constraint orders_delivery_fee_chk
      check (delivery_fee >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_delivery_distance_chk'
  ) then
    alter table public.orders
      add constraint orders_delivery_distance_chk
      check (delivery_distance_km is null or delivery_distance_km >= 0);
  end if;
end
$$;

create index if not exists orders_fulfillment_method_idx on public.orders(fulfillment_method);
create index if not exists orders_delivery_store_location_idx on public.orders(delivery_store_location_id);
create index if not exists orders_delivery_pricing_config_idx on public.orders(delivery_pricing_config_id);

drop trigger if exists store_locations_set_updated_at on public.store_locations;
create trigger store_locations_set_updated_at
before update on public.store_locations
for each row execute function public.set_updated_at();

drop trigger if exists delivery_pricing_configs_set_updated_at on public.delivery_pricing_configs;
create trigger delivery_pricing_configs_set_updated_at
before update on public.delivery_pricing_configs
for each row execute function public.set_updated_at();

drop trigger if exists delivery_pricing_brackets_set_updated_at on public.delivery_pricing_brackets;
create trigger delivery_pricing_brackets_set_updated_at
before update on public.delivery_pricing_brackets
for each row execute function public.set_updated_at();

alter table public.store_locations enable row level security;
alter table public.delivery_pricing_configs enable row level security;
alter table public.delivery_pricing_brackets enable row level security;

do $$
declare
  seeded_store_id uuid;
  seeded_config_id uuid;
begin
  -- Coordinates sourced from the public contact page map embed.
  insert into public.store_locations (
    code,
    name,
    address_text,
    latitude,
    longitude,
    is_active
  )
  values (
    'kira-main',
    'KiRA Bakery',
    'Kito village, Mamerito Mugerwa Road, Kira, Uganda',
    0.4017405,
    32.6518115,
    true
  )
  on conflict (code) do update
  set
    name = excluded.name,
    address_text = excluded.address_text,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    is_active = excluded.is_active,
    updated_at = now()
  returning id into seeded_store_id;

  update public.store_locations
  set is_active = (id = seeded_store_id)
  where code = 'kira-main';

  insert into public.delivery_pricing_configs (
    store_location_id,
    name,
    is_active,
    max_delivery_distance_km
  )
  values (
    seeded_store_id,
    'Standard Delivery Pricing',
    true,
    5.40
  )
  on conflict (store_location_id, name) do update
  set
    is_active = excluded.is_active,
    max_delivery_distance_km = excluded.max_delivery_distance_km,
    updated_at = now()
  returning id into seeded_config_id;

  update public.delivery_pricing_configs
  set is_active = (id = seeded_config_id)
  where store_location_id = seeded_store_id;

  insert into public.delivery_pricing_brackets (
    pricing_config_id,
    min_distance_km,
    max_distance_km,
    fee,
    sort_order
  )
  values
    (seeded_config_id, 0.00, 1.40, 1000, 1),
    (seeded_config_id, 1.41, 1.79, 1500, 2),
    (seeded_config_id, 1.80, 2.40, 2000, 3),
    (seeded_config_id, 2.41, 2.90, 2500, 4),
    (seeded_config_id, 2.91, 3.40, 3000, 5),
    (seeded_config_id, 3.41, 3.90, 3500, 6),
    (seeded_config_id, 3.91, 4.40, 4000, 7),
    (seeded_config_id, 4.41, 4.90, 4500, 8),
    (seeded_config_id, 4.91, 5.40, 5000, 9)
  on conflict (pricing_config_id, min_distance_km, max_distance_km) do update
  set
    fee = excluded.fee,
    sort_order = excluded.sort_order,
    updated_at = now();
end
$$;

drop function if exists public.place_guest_order(
  uuid,
  integer,
  public.order_status,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
);

create or replace function public.place_guest_order(
  order_id uuid,
  order_total_ugx integer,
  order_status public.order_status,
  order_fulfillment_method text,
  order_customer_name text,
  order_phone text,
  order_email text,
  order_delivery_address_text text,
  order_delivery_date date,
  order_notes text,
  order_delivery_place_id text,
  order_delivery_latitude numeric,
  order_delivery_longitude numeric,
  order_delivery_distance_km numeric,
  order_delivery_fee integer,
  order_delivery_pricing_config_id uuid,
  order_delivery_store_location_id uuid,
  order_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_fulfillment_method text := case
    when order_fulfillment_method = 'delivery' then 'delivery'
    else 'pickup'
  end;
  legacy_order_status text := case order_status
    when 'Pending' then 'pending'
    when 'In Progress' then 'preparing'
    when 'Ready' then 'ready_for_pickup'
    when 'Delivered' then 'delivered'
    else 'pending'
  end;
  normalized_delivery_address text := nullif(trim(coalesce(order_delivery_address_text, '')), '');
  normalized_delivery_fee integer := case
    when order_fulfillment_method = 'delivery' then greatest(coalesce(order_delivery_fee, 0), 0)
    else 0
  end;
begin
  insert into public.orders (
    id,
    customer_name,
    customer_phone,
    customer_email,
    delivery_address,
    order_status,
    payment_status,
    payment_provider,
    total_price,
    total_ugx,
    status,
    fulfillment_method,
    delivery_method,
    phone,
    email,
    address,
    delivery_address_text,
    delivery_place_id,
    delivery_latitude,
    delivery_longitude,
    delivery_distance_km,
    delivery_fee,
    delivery_pricing_config_id,
    delivery_store_location_id,
    delivery_date,
    notes
  )
  values (
    order_id,
    order_customer_name,
    order_phone,
    nullif(order_email, ''),
    normalized_delivery_address,
    legacy_order_status,
    'unpaid',
    'pesapal',
    order_total_ugx,
    order_total_ugx,
    order_status,
    normalized_fulfillment_method,
    normalized_fulfillment_method,
    order_phone,
    nullif(order_email, ''),
    normalized_delivery_address,
    normalized_delivery_address,
    case when normalized_fulfillment_method = 'delivery' then nullif(order_delivery_place_id, '') else null end,
    case when normalized_fulfillment_method = 'delivery' then order_delivery_latitude else null end,
    case when normalized_fulfillment_method = 'delivery' then order_delivery_longitude else null end,
    case when normalized_fulfillment_method = 'delivery' then order_delivery_distance_km else null end,
    normalized_delivery_fee,
    case when normalized_fulfillment_method = 'delivery' then order_delivery_pricing_config_id else null end,
    case when normalized_fulfillment_method = 'delivery' then order_delivery_store_location_id else null end,
    order_delivery_date,
    nullif(order_notes, '')
  );

  insert into public.order_items (
    order_id,
    product_id,
    name,
    image,
    price_ugx,
    quantity,
    selected_size,
    selected_flavor,
    price_at_time
  )
  select
    order_id,
    item.product_id,
    item.name,
    item.image,
    item.price_ugx,
    item.quantity,
    item.selected_size,
    item.selected_flavor,
    item.price_ugx
  from jsonb_to_recordset(order_items) as item(
    product_id uuid,
    name text,
    image text,
    price_ugx integer,
    quantity integer,
    selected_size text,
    selected_flavor text
  );
end;
$$;

commit;
