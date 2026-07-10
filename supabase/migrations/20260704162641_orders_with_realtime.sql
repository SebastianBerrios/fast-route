-- Delivery orders. An order is a delivery to a map location; pending orders
-- become the stops the route optimizer sequences.
create type public.order_status as enum ('pending', 'delivered', 'cancelled');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  customer_name text,
  note text,
  lng double precision not null,
  lat double precision not null,
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- Single-tenant staff model: any signed-in user is staff of this business.
create policy "Staff can view orders"
  on public.orders for select
  to authenticated
  using (true);

create policy "Staff can create orders"
  on public.orders for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Staff can update orders"
  on public.orders for update
  to authenticated
  using (true)
  with check (true);

create policy "Creators can delete their own orders"
  on public.orders for delete
  to authenticated
  using ((select auth.uid()) = created_by);

create index orders_status_idx on public.orders (status);

-- Keep updated_at fresh on every update.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

-- Realtime: broadcast row changes to subscribed clients.
-- REPLICA IDENTITY FULL ensures UPDATE/DELETE events carry full row data
-- so RLS can be evaluated and clients get what they need.
alter table public.orders replica identity full;
alter publication supabase_realtime add table public.orders;