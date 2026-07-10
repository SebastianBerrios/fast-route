-- 1. Mirror profiles.role into auth.users.app_metadata so RLS can read it
--    from the JWT (auth.jwt() -> 'app_metadata' ->> 'role'). This is the
--    Supabase-recommended place for authorization data (never user_metadata).
create or replace function private.sync_role_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role)
  where id = new.id;
  return new;
end;
$$;

create trigger profiles_sync_role
  after insert or update of role on public.profiles
  for each row execute function private.sync_role_to_app_metadata();

-- Backfill existing users (e.g. the current admin) so their next token carries the claim.
update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
from public.profiles p
where p.id = u.id;

-- 2. Prevent privilege escalation: only admins may change a role.
--    Fires before the row is written; skips privileged/no-session contexts.
create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_change
  before update on public.profiles
  for each row execute function private.guard_role_change();

-- 3. Role-aware policies on profiles: admins can see and manage everyone.
create policy "Admins view all profiles"
  on public.profiles for select
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins update any profile"
  on public.profiles for update
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 4. Role-aware order permissions.
--    Sellers manage their own; admins and drivers can update any (mark delivered).
drop policy "Creators can update their own orders" on public.orders;
create policy "Update own or as admin/driver"
  on public.orders for update
  to authenticated
  using (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'driver')
  )
  with check (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'driver')
  );

drop policy "Creators can delete their own orders" on public.orders;
create policy "Delete own or as admin"
  on public.orders for delete
  to authenticated
  using (
    (select auth.uid()) = created_by
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );