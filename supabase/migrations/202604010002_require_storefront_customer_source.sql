begin;

create or replace function public.enforce_storefront_customer_origin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_customer_origin text;
begin
  if new.id is null then
    raise exception 'customers.id is required';
  end if;

  select auth_user.raw_user_meta_data ->> 'customer_origin'
  into auth_customer_origin
  from auth.users as auth_user
  where auth_user.id = new.id;

  if auth_customer_origin is null then
    raise exception using
      message = 'Customer rows can only be created for storefront signups.',
      detail = 'Missing auth.users.raw_user_meta_data.customer_origin.',
      hint = 'Mark storefront signups with customer_origin=storefront_pwa before inserting into public.customers.';
  end if;

  if auth_customer_origin <> 'storefront_pwa' then
    raise exception using
      message = 'Customer rows can only be created for storefront signups.',
      detail = format(
        'Expected customer_origin=storefront_pwa but found %s.',
        quote_nullable(auth_customer_origin)
      ),
      hint = 'Only storefront-created customer accounts may populate public.customers.';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.customers') is null then
    raise notice 'Skipping customer origin trigger because public.customers does not exist in this schema snapshot.';
    return;
  end if;

  execute 'drop trigger if exists customers_require_storefront_origin on public.customers';
  execute '
    create trigger customers_require_storefront_origin
    before insert on public.customers
    for each row
    execute function public.enforce_storefront_customer_origin()
  ';
end
$$;

commit;
