begin;

do $$
declare
  pricing_config record;
begin
  for pricing_config in
    select config.id
    from public.delivery_pricing_configs as config
    inner join public.store_locations as store
      on store.id = config.store_location_id
    where config.is_active = true
      and store.is_active = true
  loop
    update public.delivery_pricing_configs
    set
      max_delivery_distance_km = greatest(coalesce(max_delivery_distance_km, 0), 8.50),
      updated_at = now()
    where id = pricing_config.id;

    insert into public.delivery_pricing_brackets (
      pricing_config_id,
      min_distance_km,
      max_distance_km,
      fee,
      sort_order
    )
    values
      (pricing_config.id, 5.41, 5.90, 5500, 10),
      (pricing_config.id, 5.91, 6.40, 6000, 11),
      (pricing_config.id, 6.41, 6.90, 6500, 12),
      (pricing_config.id, 6.91, 7.40, 7000, 13),
      (pricing_config.id, 7.41, 7.90, 7500, 14),
      (pricing_config.id, 7.91, 8.50, 8000, 15)
    on conflict (pricing_config_id, min_distance_km, max_distance_km) do update
    set
      fee = excluded.fee,
      sort_order = excluded.sort_order,
      updated_at = now();
  end loop;
end
$$;

commit;
