-- Stock levels live on products; changes are recorded in an append-only ledger.
alter table public.products
  add column stock numeric(12, 2) not null default 0,
  add column min_stock numeric(12, 2) not null default 0;

create type public.stock_reason as enum ('purchase', 'sale', 'adjustment');

-- Immutable ledger: every stock change is a movement with a reason.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  delta numeric(12, 2) not null,
  reason public.stock_reason not null default 'adjustment',
  order_id uuid references public.orders (id) on delete set null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.stock_movements enable row level security;

-- Append-only: staff can read all and record their own movements. No update/delete.
create policy "Staff view stock movements"
  on public.stock_movements for select
  to authenticated
  using (true);

create policy "Staff record stock movements"
  on public.stock_movements for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create index stock_movements_product_id_idx on public.stock_movements (product_id);

-- Keep products.stock as the running total of its movements.
create or replace function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set stock = stock + new.delta
  where id = new.product_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function private.apply_stock_movement();

-- When an order is delivered, log a 'sale' movement per line item (auto-deduct).
create or replace function private.deduct_stock_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    for item in
      select product_id, quantity
      from public.order_items
      where order_id = new.id and product_id is not null
    loop
      insert into public.stock_movements (product_id, delta, reason, order_id, created_by, note)
      values (item.product_id, -item.quantity, 'sale', new.id, new.delivered_by, 'Venta entregada');
    end loop;
  end if;
  return new;
end;
$$;

create trigger orders_deduct_stock
  after update on public.orders
  for each row execute function private.deduct_stock_on_delivery();