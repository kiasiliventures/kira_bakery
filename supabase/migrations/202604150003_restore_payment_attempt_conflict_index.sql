begin;

drop index if exists public.payment_attempts_provider_reference_uidx;

create unique index if not exists payment_attempts_provider_reference_uidx
  on public.payment_attempts(provider, provider_reference);

commit;
