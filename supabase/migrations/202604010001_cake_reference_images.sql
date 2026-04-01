begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
select
  'cake-reference-images',
  'cake-reference-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
where not exists (
  select 1
  from storage.buckets
  where id = 'cake-reference-images'
);

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'cake-reference-images';

alter table if exists public.cake_custom_requests
  add column if not exists reference_image_bucket text,
  add column if not exists reference_image_path text,
  add column if not exists reference_image_original_name text,
  add column if not exists reference_image_content_type text,
  add column if not exists reference_image_size_bytes integer,
  add column if not exists reference_image_uploaded_at timestamptz;

do $$
begin
  if to_regclass('public.cake_custom_requests') is not null then
    execute '
      create index if not exists cake_custom_requests_reference_image_path_idx
      on public.cake_custom_requests(reference_image_path)
      where reference_image_path is not null
    ';
  end if;
end
$$;

commit;
