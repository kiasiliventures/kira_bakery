begin;

alter table public.api_idempotency_keys
  add column if not exists client_binding_hash text;

commit;
