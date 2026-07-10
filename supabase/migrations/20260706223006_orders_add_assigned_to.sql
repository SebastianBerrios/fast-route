alter table public.orders
  add column assigned_to uuid references auth.users(id) on delete set null;

create index if not exists orders_tenant_assigned_idx
  on public.orders(tenant_id, assigned_to);

comment on column public.orders.assigned_to is
  'Driver this order is assigned to; null = free for anyone to take';