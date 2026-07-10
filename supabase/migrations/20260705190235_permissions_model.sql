-- Per-user granular permissions (actions). Roles seed a default set; admins
-- can add/remove individual actions per user. Enforced via JWT app_metadata.
alter table public.profiles
  add column permissions text[] not null default '{}';

-- Default action set for each role (the "template").
create or replace function private.default_permissions(r public.user_role)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'admin' then array[
      'orders.create','orders.deliver','orders.manage',
      'customers.manage','products.manage',
      'sales.view','metrics.view','users.manage'
    ]
    when 'seller' then array['orders.create','customers.manage']
    when 'driver' then array['orders.deliver']
    else array[]::text[]
  end;
$$;

-- Seed existing users from their current role.
update public.profiles set permissions = private.default_permissions(role);

-- Backfill JWT app_metadata with permissions.
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('permissions', to_jsonb(p.permissions))
from public.profiles p
where p.id = u.id;

-- Mirror role + tenant_id + permissions into the JWT on any relevant change.
create or replace function private.sync_role_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'role', new.role,
      'tenant_id', new.tenant_id,
      'permissions', to_jsonb(new.permissions)
    )
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists profiles_sync_role on public.profiles;
create trigger profiles_sync_role
  after insert or update of role, tenant_id, permissions on public.profiles
  for each row execute function private.sync_role_to_app_metadata();

-- New business owner (signup) gets the full admin permission set.
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

  insert into public.profiles (id, tenant_id, email, full_name, role, permissions)
  values (
    new.id,
    new_tenant,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'admin',
    private.default_permissions('admin')
  );
  return new;
end;
$$;

-- Only users with the users.manage permission may change someone's role.
create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not coalesce(
       (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'users.manage',
       false
     ) then
    raise exception 'Solo un usuario con gestión de usuarios puede cambiar roles';
  end if;
  return new;
end;
$$;