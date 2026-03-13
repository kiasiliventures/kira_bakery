begin;

alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists delivery_address text,
  add column if not exists order_status text,
  add column if not exists payment_status text default 'unpaid',
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_redirect_url text,
  add column if not exists paid_at timestamptz,
  add column if not exists order_tracking_id text,
  add column if not exists total_price integer;

alter table public.order_items
  add column if not exists price_at_time integer;

update public.orders
set
  customer_phone = coalesce(customer_phone, phone),
  customer_email = coalesce(customer_email, email),
  delivery_address = coalesce(delivery_address, address),
  order_status = coalesce(
    order_status,
    case status
      when 'Pending' then 'pending'
      when 'In Progress' then 'preparing'
      when 'Ready' then 'ready_for_pickup'
      when 'Delivered' then 'delivered'
      else 'pending'
    end
  ),
  payment_status = coalesce(
    payment_status,
    case
      when status = 'Pending' then 'unpaid'
      else 'paid'
    end
  ),
  total_price = coalesce(total_price, total_ugx);

update public.order_items
set price_at_time = coalesce(price_at_time, price_ugx);

create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_payment_provider_idx on public.orders(payment_provider);
create index if not exists orders_payment_reference_idx on public.orders(payment_reference);
create unique index if not exists orders_order_tracking_id_idx
  on public.orders(order_tracking_id)
  where order_tracking_id is not null;

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
    payment_provider,
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
    'pesapal',
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

commit;
