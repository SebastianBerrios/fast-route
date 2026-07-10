-- Registered customers with a saved delivery location.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  address text,
  note text,
  lng double precision,
  lat double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Staff can view customers"
  on public.customers for select
  to authenticated
  using (true);

create policy "Staff can create customers"
  on public.customers for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Owner or admin can update customers"
  on public.customers for update
  to authenticated
  using (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Owner or admin can delete customers"
  on public.customers for delete
  to authenticated
  using (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

create index customers_name_idx on public.customers (name);

alter table public.customers replica identity full;
alter publication supabase_realtime add table public.customers;

-- Link orders to a registered customer. Nullable: ad-hoc orders keep it null.
-- on delete set null keeps historical orders if a customer is removed.
alter table public.orders
  add column customer_id uuid references public.customers (id) on delete set null;