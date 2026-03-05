begin;

create table if not exists public.api_idempotency_keys (
  key text primary key,
  endpoint text not null check (char_length(endpoint) >= 1),
  request_hash text not null,
  resource_id text,
  response_status integer check (response_status is null or response_status between 100 and 599),
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint api_idempotency_keys_response_pair_chk check (
    (response_status is null and response_body is null)
    or (response_status is not null and response_body is not null)
  )
);

create index if not exists api_idempotency_keys_endpoint_created_at_idx
  on public.api_idempotency_keys(endpoint, created_at desc);

alter table public.api_idempotency_keys enable row level security;

commit;
