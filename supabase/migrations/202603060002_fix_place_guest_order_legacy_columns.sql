-- Populate both shared client-facing and legacy admin order columns during guest checkout.

create or replace function public.place_guest_order(
  order_id uuid,
  order_total_ugx integer,
  order_status public.order_status,
  order_delivery_method text,
  order_customer_name text,
  order_phone text,
  order_email text,
  order_address text,
  order_delivery_date date,
  order_notes text,
  order_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  legacy_order_status text := case order_status
    when 'Pending' then 'pending'
    when 'In Progress' then 'preparing'
    when 'Ready' then 'ready_for_pickup'
    when 'Delivered' then 'delivered'
    else 'pending'
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
    total_price,
    total_ugx,
    status,
    delivery_method,
    phone,
    email,
    address,
    delivery_date,
    notes
  )
  values (
    order_id,
    order_customer_name,
    order_phone,
    nullif(order_email, ''),
    nullif(order_address, ''),
    legacy_order_status,
    'unpaid',
    order_total_ugx,
    order_total_ugx,
    order_status,
    order_delivery_method,
    order_phone,
    nullif(order_email, ''),
    nullif(order_address, ''),
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
