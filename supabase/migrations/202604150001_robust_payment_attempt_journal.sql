begin;

alter table public.payment_attempts
  add column if not exists local_attempt_id uuid default gen_random_uuid(),
  add column if not exists merchant_reference text,
  add column if not exists raw_request_payload jsonb,
  add column if not exists provider_request_started_at timestamptz,
  add column if not exists response_received_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists failure_phase text,
  add column if not exists attempt_number integer,
  add column if not exists verified_payment_status text,
  add column if not exists last_verification_response jsonb,
  add column if not exists updated_at timestamptz default now();

alter table public.payment_attempts
  alter column provider_reference drop not null;

update public.payment_attempts
set merchant_reference = coalesce(merchant_reference, order_id::text);

with ranked_attempts as (
  select
    id,
    row_number() over (
      partition by order_id
      order by created_at asc, id asc
    ) as next_attempt_number
  from public.payment_attempts
)
update public.payment_attempts pa
set attempt_number = ranked_attempts.next_attempt_number
from ranked_attempts
where pa.id = ranked_attempts.id
  and pa.attempt_number is null;

update public.payment_attempts
set verified_payment_status = lower(trim(status))
where verified_payment_status is null
  and lower(trim(status)) in ('pending', 'paid', 'failed', 'cancelled', 'canceled');

update public.payment_attempts
set status = case
  when lower(trim(status)) in ('initiating', 'initiated', 'rejected', 'failed') then lower(trim(status))
  when provider_reference is not null and redirect_url is not null then 'initiated'
  when lower(trim(status)) in ('cancelled', 'canceled') then 'rejected'
  else 'failed'
end;

update public.payment_attempts
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.payment_attempts
  alter column local_attempt_id set default gen_random_uuid(),
  alter column local_attempt_id set not null,
  alter column merchant_reference set not null,
  alter column attempt_number set default 1,
  alter column attempt_number set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop index if exists payment_attempts_provider_reference_uidx;

create unique index if not exists payment_attempts_local_attempt_uidx
  on public.payment_attempts(local_attempt_id);

create unique index if not exists payment_attempts_order_attempt_number_uidx
  on public.payment_attempts(order_id, attempt_number);

create unique index if not exists payment_attempts_provider_reference_uidx
  on public.payment_attempts(provider, provider_reference)
  where provider_reference is not null;

create index if not exists payment_attempts_order_created_idx
  on public.payment_attempts(order_id, created_at desc);

create index if not exists payment_attempts_status_created_idx
  on public.payment_attempts(status, created_at desc);

create index if not exists payment_attempts_merchant_reference_idx
  on public.payment_attempts(merchant_reference, created_at desc);

alter table public.orders
  add column if not exists active_payment_attempt_id uuid
  references public.payment_attempts(id)
  on delete set null;

create index if not exists orders_active_payment_attempt_idx
  on public.orders(active_payment_attempt_id)
  where active_payment_attempt_id is not null;

commit;
