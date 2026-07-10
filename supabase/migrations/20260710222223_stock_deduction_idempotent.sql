-- Make delivery-time stock deduction idempotent.
create or replace function private.deduct_stock_on_delivery()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  item record;
  pool_id uuid;
begin
  if new.status = 'delivered'
     and old.status is distinct from 'delivered'
     and not exists (
       select 1 from public.stock_movements
       where order_id = new.id and reason = 'sale'
     ) then
    for item in
      select product_id, quantity
      from public.order_items
      where order_id = new.id and product_id is not null
    loop
      select coalesce(p.stock_source_id, p.id) into pool_id
      from public.products p
      where p.id = item.product_id;

      if pool_id is not null then
        insert into public.stock_movements (product_id, delta, reason, order_id, created_by, note)
        values (pool_id, -item.quantity, 'sale', new.id, new.delivered_by, 'Venta entregada');
      end if;
    end loop;
  end if;
  return new;
end;
$function$;