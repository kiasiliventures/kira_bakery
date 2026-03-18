begin;

alter table public.orders
  add column if not exists order_access_token text;

update public.orders
set order_access_token = gen_random_uuid()::text
where order_access_token is null
   or nullif(trim(order_access_token), '') is null;

alter table public.orders
  alter column order_access_token set not null;

create unique index if not exists orders_order_access_token_idx
  on public.orders(order_access_token);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_order_access_token_not_blank_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_order_access_token_not_blank_chk
      check (char_length(trim(order_access_token)) >= 20);
  end if;
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
  text,
  numeric,
  numeric,
  numeric,
  integer,
  uuid,
  uuid,
  jsonb
);

create or replace function public.place_guest_order(
  order_id uuid,
  order_access_token text,
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
  normalized_access_token text := nullif(trim(coalesce(order_access_token, '')), '');
begin
  if normalized_access_token is null then
    raise exception 'order_access_token is required';
  end if;

  insert into public.orders (
    id,
    order_access_token,
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
    normalized_access_token,
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
    price_at_time,
    quantity,
    selected_size,
    selected_flavor
  )
  select
    order_id,
    item.product_id,
    item.name,
    item.image,
    item.price_ugx,
    item.price_ugx,
    item.quantity,
    item.selected_size,
    item.selected_flavor
  from jsonb_to_recordset(coalesce(order_items, '[]'::jsonb)) as item(
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

revoke all on function public.place_guest_order(
  uuid,
  text,
  integer,
  public.order_status,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  uuid,
  uuid,
  jsonb
) from public, anon, authenticated;

grant execute on function public.place_guest_order(
  uuid,
  text,
  integer,
  public.order_status,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  uuid,
  uuid,
  jsonb
) to service_role;

commit;
