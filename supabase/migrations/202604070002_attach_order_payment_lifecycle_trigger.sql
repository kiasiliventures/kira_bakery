begin;

drop trigger if exists orders_sync_payment_lifecycle on public.orders;
create trigger orders_sync_payment_lifecycle
before insert or update on public.orders
for each row execute function public.sync_order_payment_lifecycle();

update public.orders
set payment_status = payment_status
where lower(trim(coalesce(payment_status, ''))) in ('paid', 'completed');

commit;
