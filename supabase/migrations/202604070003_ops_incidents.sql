begin;

create table if not exists public.ops_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  source text not null,
  message text not null,
  order_id uuid null references public.orders(id) on delete set null,
  payment_tracking_id text null,
  dedupe_key text not null unique,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists ops_incidents_status_last_seen_idx
  on public.ops_incidents(status, last_seen_at desc);

create index if not exists ops_incidents_order_id_idx
  on public.ops_incidents(order_id)
  where order_id is not null;

create or replace function public.report_ops_incident(
  p_incident_type text,
  p_severity text,
  p_source text,
  p_message text,
  p_order_id uuid default null,
  p_payment_tracking_id text default null,
  p_dedupe_key text default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  incident_id uuid;
begin
  if coalesce(trim(p_incident_type), '') = '' then
    raise exception 'Incident type is required.';
  end if;

  if coalesce(trim(p_source), '') = '' then
    raise exception 'Incident source is required.';
  end if;

  if coalesce(trim(p_message), '') = '' then
    raise exception 'Incident message is required.';
  end if;

  if p_severity not in ('critical', 'high', 'medium', 'low') then
    raise exception 'Invalid incident severity.';
  end if;

  if coalesce(trim(p_dedupe_key), '') = '' then
    raise exception 'Incident dedupe key is required.';
  end if;

  insert into public.ops_incidents as incident (
    incident_type,
    severity,
    source,
    message,
    order_id,
    payment_tracking_id,
    dedupe_key,
    context
  )
  values (
    p_incident_type,
    p_severity,
    p_source,
    p_message,
    p_order_id,
    p_payment_tracking_id,
    p_dedupe_key,
    coalesce(p_context, '{}'::jsonb)
  )
  on conflict (dedupe_key) do update
  set
    severity = excluded.severity,
    source = excluded.source,
    message = excluded.message,
    order_id = coalesce(excluded.order_id, incident.order_id),
    payment_tracking_id = coalesce(excluded.payment_tracking_id, incident.payment_tracking_id),
    context = coalesce(incident.context, '{}'::jsonb) || coalesce(excluded.context, '{}'::jsonb),
    status = case
      when incident.status = 'resolved' then 'open'
      else incident.status
    end,
    occurrence_count = incident.occurrence_count + 1,
    last_seen_at = now(),
    resolved_at = case
      when incident.status = 'resolved' then null
      else incident.resolved_at
    end
  returning incident.id into incident_id;

  return incident_id;
end;
$$;

alter table public.ops_incidents enable row level security;

drop policy if exists "Admins can read operational incidents"
  on public.ops_incidents;

create policy "Admins can read operational incidents"
  on public.ops_incidents
  for select
  to authenticated
  using (public.has_role(array['admin'::public.app_role]));

drop policy if exists "Admins can update operational incidents"
  on public.ops_incidents;

create policy "Admins can update operational incidents"
  on public.ops_incidents
  for update
  to authenticated
  using (public.has_role(array['admin'::public.app_role]))
  with check (public.has_role(array['admin'::public.app_role]));

revoke all on table public.ops_incidents from public, anon, authenticated;
revoke all on function public.report_ops_incident(text, text, text, text, uuid, text, text, jsonb) from public;
revoke all on function public.report_ops_incident(text, text, text, text, uuid, text, text, jsonb) from anon;
revoke all on function public.report_ops_incident(text, text, text, text, uuid, text, text, jsonb) from authenticated;
grant select, update on table public.ops_incidents to authenticated;
grant execute on function public.report_ops_incident(text, text, text, text, uuid, text, text, jsonb) to service_role;

commit;
