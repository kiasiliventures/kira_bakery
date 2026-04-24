begin;

alter table if exists public.admin_push_retry_queue
  enable row level security;

commit;
