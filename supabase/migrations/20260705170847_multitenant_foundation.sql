-- ============================================================
-- Multitenant foundation: every business is an isolated tenant.
-- ============================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

create policy "Members view their tenant"
  on public.tenants for select
  to authenticated
  using (id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Default tenant to hold all pre-existing data.
insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Mi negocio');

-- Add tenant_id everywhere (nullable first, then backfill, then lock down).
alter table public.profiles add column tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.customers add column tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.products add column tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.orders add column tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.order_items add column tenant_id uuid references public.tenants (id) on delete cascade;
alter table public.stock_movements add column tenant_id uuid references public.tenants (id) on delete cascade;

update public.profiles set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.customers set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.products set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.orders set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.order_items set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.stock_movements set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

-- Backfill existing users' JWT app_metadata with their tenant.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('tenant_id', p.tenant_id)
from public.profiles p
where p.id = u.id;

-- Auto-fill tenant_id from the caller's JWT on insert (client never sends it,
-- and cannot spoof another tenant). Profiles are set explicitly by the trigger.
alter table public.customers alter column tenant_id set default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
alter table public.products alter column tenant_id set default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
alter table public.orders alter column tenant_id set default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
alter table public.order_items alter column tenant_id set default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
alter table public.stock_movements alter column tenant_id set default (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

alter table public.profiles alter column tenant_id set not null;
alter table public.customers alter column tenant_id set not null;
alter table public.products alter column tenant_id set not null;
alter table public.orders alter column tenant_id set not null;
alter table public.order_items alter column tenant_id set not null;
alter table public.stock_movements alter column tenant_id set not null;

-- Mirror role AND tenant_id into JWT app_metadata (RLS reads them from the token).
create or replace function private.sync_role_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', new.role, 'tenant_id', new.tenant_id)
  where id = new.id;
  return new;
end;
$$;

-- Signup creates a brand-new tenant; the creator becomes its admin.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant uuid;
begin
  insert into public.tenants (name)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), 'Mi negocio'))
  returning id into new_tenant;

  insert into public.profiles (id, tenant_id, email, full_name, role)
  values (
    new.id,
    new_tenant,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'admin'
  );
  return new;
end;
$$;