-- Every RLS policy filters by tenant_id, so index it everywhere.
create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);
create index if not exists customers_tenant_id_idx on public.customers (tenant_id);
create index if not exists products_tenant_id_idx on public.products (tenant_id);
create index if not exists orders_tenant_id_idx on public.orders (tenant_id);
create index if not exists order_items_tenant_id_idx on public.order_items (tenant_id);
create index if not exists stock_movements_tenant_id_idx on public.stock_movements (tenant_id);

-- created_by is used in ownership checks.
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists customers_created_by_idx on public.customers (created_by);
create index if not exists products_created_by_idx on public.products (created_by);