-- Marks the order a driver is currently heading to (their locked "next stop").
-- Nullable; one per driver is enforced in app logic. Covered by the existing
-- orders UPDATE policy (owner / orders.deliver / orders.manage).
alter table public.orders
  add column en_route_by uuid references auth.users (id) on delete set null;

create index orders_en_route_by_idx on public.orders (en_route_by);