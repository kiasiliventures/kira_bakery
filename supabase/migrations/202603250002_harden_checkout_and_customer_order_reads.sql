begin;

create or replace function public.calculate_checkout_items_total_ugx(
  order_items jsonb
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  calculated_total integer;
begin
  if jsonb_typeof(coalesce(order_items, '[]'::jsonb)) <> 'array' then
    raise exception 'order_items must be an array';
  end if;

  if jsonb_array_length(coalesce(order_items, '[]'::jsonb)) = 0 then
    raise exception 'order_items must contain at least one item';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(order_items, '[]'::jsonb)) as item(
      product_id uuid,
      name text,
      image text,
      price_ugx integer,
      quantity integer,
      selected_size text,
      selected_flavor text
    )
    where nullif(trim(coalesce(item.name, '')), '') is null
      or item.price_ugx is null
      or item.price_ugx < 0
      or item.quantity is null
      or item.quantity <= 0
  ) then
    raise exception 'order_items contains invalid item data';
  end if;

  select coalesce(sum(item.price_ugx * item.quantity), 0)
    into calculated_total
  from jsonb_to_recordset(coalesce(order_items, '[]'::jsonb)) as item(
    product_id uuid,
    name text,
    image text,
    price_ugx integer,
    quantity integer,
    selected_size text,
    selected_flavor text
  );

  return calculated_total;
end;
$$;

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
  calculated_items_total integer := public.calculate_checkout_items_total_ugx(order_items);
begin
  if normalized_access_token is null then
    raise exception 'order_access_token is required';
  end if;

  if order_total_ugx <> calculated_items_total + normalized_delivery_fee then
    raise exception 'order_total_ugx does not match order items total';
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

create or replace function public.place_authenticated_order(
  order_id uuid,
  order_customer_id uuid,
  order_access_token text,
  order_total_ugx integer,
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
  normalized_delivery_address text := nullif(trim(coalesce(order_delivery_address_text, '')), '');
  normalized_delivery_fee integer := case
    when order_fulfillment_method = 'delivery' then greatest(coalesce(order_delivery_fee, 0), 0)
    else 0
  end;
  normalized_access_token text := nullif(trim(coalesce(order_access_token, '')), '');
  calculated_items_total integer := public.calculate_checkout_items_total_ugx(order_items);
begin
  if normalized_access_token is null then
    raise exception 'order_access_token is required';
  end if;

  if order_customer_id is null then
    raise exception 'order_customer_id is required';
  end if;

  if order_total_ugx <> calculated_items_total + normalized_delivery_fee then
    raise exception 'order_total_ugx does not match order items total';
  end if;

  insert into public.orders (
    id,
    customer_id,
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
    order_customer_id,
    normalized_access_token,
    order_customer_name,
    order_phone,
    nullif(order_email, ''),
    normalized_delivery_address,
    'pending_payment',
    'unpaid',
    'pesapal',
    order_total_ugx,
    order_total_ugx,
    'Pending Payment',
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

drop policy if exists "orders_customer_read_self" on public.orders;
create policy "orders_customer_read_self"
on public.orders for select
to authenticated
using (customer_id = auth.uid());

drop policy if exists "order_items_customer_read_self" on public.order_items;
create policy "order_items_customer_read_self"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.customer_id = auth.uid()
  )
);

commit;
