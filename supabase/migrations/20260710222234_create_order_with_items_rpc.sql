-- Atomic order creation: order + its items in a single transaction.
create or replace function public.create_order_with_items(
  p_lng double precision,
  p_lat double precision,
  p_customer_name text default null,
  p_note text default null,
  p_customer_id uuid default null,
  p_assigned_to uuid default null,
  p_items jsonb default '[]'::jsonb
)
  returns uuid
  language plpgsql
  security invoker
  set search_path to ''
as $function$
declare
  v_order_id uuid;
  v_item jsonb;
begin
  if p_lng is null or p_lat is null
     or p_lng < -180 or p_lng > 180
     or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates: lng=%, lat=%', p_lng, p_lat;
  end if;

  insert into public.orders (created_by, lng, lat, customer_name, note, customer_id, assigned_to)
  values (auth.uid(), p_lng, p_lat,
          nullif(p_customer_name, ''), nullif(p_note, ''), p_customer_id, p_assigned_to)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (
      v_order_id,
      nullif(v_item ->> 'product_id', '')::uuid,
      coalesce(v_item ->> 'product_name', ''),
      coalesce((v_item ->> 'quantity')::numeric, 1),
      coalesce((v_item ->> 'unit_price')::numeric, 0)
    );
  end loop;

  return v_order_id;
end;
$function$;

grant execute on function public.create_order_with_items(
  double precision, double precision, text, text, uuid, uuid, jsonb
) to authenticated;