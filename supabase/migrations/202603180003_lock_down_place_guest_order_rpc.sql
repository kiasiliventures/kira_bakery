begin;

do $$
declare
  target_function record;
begin
  for target_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'place_guest_order'
  loop
    execute format('revoke all on function %s from public', target_function.signature);
    execute format('revoke all on function %s from anon', target_function.signature);
    execute format('revoke all on function %s from authenticated', target_function.signature);
    execute format('grant execute on function %s to service_role', target_function.signature);
  end loop;
end
$$;

commit;
