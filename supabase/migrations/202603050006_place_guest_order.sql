-- Atomic guest checkout insert for orders plus line items.

create or replace function public.place_guest_order(
  order_id text,
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
begin
  insert into public.orders (
    id,
    total_ugx,
    status,
    delivery_method,
    customer_name,
    phone,
    email,
    address,
    delivery_date,
    notes
  )
  values (
    order_id,
    order_total_ugx,
    order_status,
    order_delivery_method,
    order_customer_name,
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
    selected_flavor
  )
  select
    order_id,
    item.product_id,
    item.name,
    item.image,
    item.price_ugx,
    item.quantity,
    item.selected_size,
    item.selected_flavor
  from jsonb_to_recordset(order_items) as item(
    product_id text,
    name text,
    image text,
    price_ugx integer,
    quantity integer,
    selected_size text,
    selected_flavor text
  );
end;
$$;
