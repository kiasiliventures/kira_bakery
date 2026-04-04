begin;

alter table public.push_notification_dispatches
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists last_error text null,
  add column if not exists processing_started_at timestamptz null,
  add column if not exists next_attempt_at timestamptz not null default now();

update public.push_notification_dispatches
set next_attempt_at = coalesce(next_attempt_at, created_at)
where next_attempt_at is null;

create index if not exists push_notification_dispatches_pending_idx
  on public.push_notification_dispatches(notification_type, next_attempt_at)
  where completed_at is null;

create or replace function public.claim_push_notification_dispatch(
  dispatch_idempotency_key text,
  stale_after_seconds integer default 300
)
returns table (
  id uuid,
  idempotency_key text,
  notification_type text,
  order_id uuid,
  order_updated_at timestamptz,
  source text,
  created_at timestamptz,
  completed_at timestamptz,
  subscription_count integer,
  success_count integer,
  stale_subscription_count integer,
  attempt_count integer,
  last_attempt_at timestamptz,
  last_error text,
  processing_started_at timestamptz,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.push_notification_dispatches as dispatch
  set
    processing_started_at = now(),
    last_attempt_at = now(),
    attempt_count = dispatch.attempt_count + 1
  where dispatch.idempotency_key = dispatch_idempotency_key
    and dispatch.completed_at is null
    and dispatch.next_attempt_at <= now()
    and (
      dispatch.processing_started_at is null
      or dispatch.processing_started_at <= now() - make_interval(secs => stale_after_seconds)
    )
  returning
    dispatch.id,
    dispatch.idempotency_key,
    dispatch.notification_type,
    dispatch.order_id,
    dispatch.order_updated_at,
    dispatch.source,
    dispatch.created_at,
    dispatch.completed_at,
    dispatch.subscription_count,
    dispatch.success_count,
    dispatch.stale_subscription_count,
    dispatch.attempt_count,
    dispatch.last_attempt_at,
    dispatch.last_error,
    dispatch.processing_started_at,
    dispatch.next_attempt_at;
end;
$$;

revoke all on function public.claim_push_notification_dispatch(text, integer) from public;
revoke all on function public.claim_push_notification_dispatch(text, integer) from anon;
revoke all on function public.claim_push_notification_dispatch(text, integer) from authenticated;
grant execute on function public.claim_push_notification_dispatch(text, integer) to service_role;

commit;
