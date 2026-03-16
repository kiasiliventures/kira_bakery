begin;

alter table public.products
  add column if not exists is_published boolean;

update public.products
set is_published = true
where is_published is null;

alter table public.products
  alter column is_published set default true,
  alter column is_published set not null;

create index if not exists products_is_published_idx
  on public.products(is_published);

drop policy if exists products_public_read on public.products;

create policy products_public_read
  on public.products
  for select
  to anon, authenticated
  using (is_published = true);

commit;
