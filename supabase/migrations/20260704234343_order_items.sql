-- Line items: which products (and how many) each order carries.
-- product_name and unit_price are SNAPSHOTS taken when the item is added, so
-- historical orders keep their real totals even if the catalog price changes.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

-- All staff can see items (they can see all orders).
create policy "Staff view order items"
  on public.order_items for select
  to authenticated
  using (true);

-- Items can be added/edited/removed by whoever can manage the parent order:
-- the order's creator, or an admin.
create policy "Manage items on own orders (insert)"
  on public.order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.created_by = (select auth.uid())
          or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

create policy "Manage items on own orders (update)"
  on public.order_items for update
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.created_by = (select auth.uid())
          or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.created_by = (select auth.uid())
          or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

create policy "Manage items on own orders (delete)"
  on public.order_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.created_by = (select auth.uid())
          or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

create index order_items_order_id_idx on public.order_items (order_id);

alter table public.order_items replica identity full;
alter publication supabase_realtime add table public.order_items;