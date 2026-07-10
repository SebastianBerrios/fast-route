-- Shared stock pool: a product may deduct stock from another product's pool
-- (e.g. "Recarga" sells the same physical item as "Bidón"). One level only.

alter table public.products
  add column stock_source_id uuid null
    references public.products(id) on delete set null;

comment on column public.products.stock_source_id is
  'When set, deliveries of this product deduct stock from the referenced product (shared pool). Single level: a source cannot be linked itself.';

-- Guard: no self-links, no chains (either direction), same tenant only.
create or replace function private.check_stock_source()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  source public.products%rowtype;
begin
  if new.stock_source_id is null then
    return new;
  end if;

  if new.stock_source_id = new.id then
    raise exception 'A product cannot use itself as its stock source';
  end if;

  select * into source
  from public.products
  where id = new.stock_source_id;

  if not found then
    raise exception 'Stock source product does not exist';
  end if;

  if source.tenant_id is distinct from new.tenant_id then
    raise exception 'Stock source must belong to the same tenant';
  end if;

  if source.stock_source_id is not null then
    raise exception 'Stock source is already linked to another product (chains are not allowed)';
  end if;

  -- Reverse chain: this product is someone else's pool, so it cannot link out.
  if exists (
    select 1 from public.products p
    where p.stock_source_id = new.id
  ) then
    raise exception 'This product is a stock source for other products and cannot link to another pool';
  end if;

  return new;
end;
$$;

create trigger check_stock_source
  before insert or update of stock_source_id on public.products
  for each row
  execute function private.check_stock_source();

-- Deliveries deduct from the resolved pool: the product itself, or its source.
create or replace function private.deduct_stock_on_delivery()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  item record;
  pool_id uuid;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    for item in
      select product_id, quantity
      from public.order_items
      where order_id = new.id and product_id is not null
    loop
      select coalesce(p.stock_source_id, p.id) into pool_id
      from public.products p
      where p.id = item.product_id;

      -- Product deleted between order and delivery: nothing to deduct.
      if pool_id is not null then
        insert into public.stock_movements (product_id, delta, reason, order_id, created_by, note)
        values (pool_id, -item.quantity, 'sale', new.id, new.delivered_by, 'Venta entregada');
      end if;
    end loop;
  end if;
  return new;
end;
$$;