-- Covering indexes for foreign keys (helps cascade deletes and joins).
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_delivered_by_idx on public.orders (delivered_by);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists stock_movements_created_by_idx on public.stock_movements (created_by);
create index if not exists stock_movements_order_id_idx on public.stock_movements (order_id);
create index if not exists invites_created_by_idx on public.invites (created_by);
create index if not exists invites_used_by_idx on public.invites (used_by);