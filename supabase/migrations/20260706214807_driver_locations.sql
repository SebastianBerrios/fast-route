-- Live location of each driver, shared within the tenant.
create table public.driver_locations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    references public.tenants (id) on delete cascade,
  lng double precision not null,
  lat double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;

create policy "View tenant driver locations"
  on public.driver_locations for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Insert own location"
  on public.driver_locations for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and user_id = (select auth.uid())
  );

create policy "Update own location"
  on public.driver_locations for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and user_id = (select auth.uid())
  );

create index driver_locations_tenant_id_idx on public.driver_locations (tenant_id);
alter table public.driver_locations replica identity full;
alter publication supabase_realtime add table public.driver_locations;