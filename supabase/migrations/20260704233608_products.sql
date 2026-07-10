-- Product catalog (water, ice, etc.). Line items linking products to orders
-- come in the next slice.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  unit text,
  price numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Staff can view products"
  on public.products for select
  to authenticated
  using (true);

create policy "Staff can create products"
  on public.products for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Owner or admin can update products"
  on public.products for update
  to authenticated
  using (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "Owner or admin can delete products"
  on public.products for delete
  to authenticated
  using (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create index products_name_idx on public.products (name);

alter table public.products replica identity full;
alter publication supabase_realtime add table public.products;