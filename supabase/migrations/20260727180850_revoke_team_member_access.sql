-- Let an admin revoke a team member's access, and make it impossible to leave a
-- business with no administrator.
--
-- WHAT REVOKING MEANS HERE
-- Deleting the `profiles` row. That row IS the membership, so removing it ends
-- access: `fast_route_private.tenant_id()` goes null for that person and every
-- policy stops matching. The `auth.users` row is deliberately LEFT ALONE — the
-- mvp-lab auth pool is shared, that account may be in use by another app in the
-- fleet, and deleting it from here would be reaching into someone else's
-- system. Losing the profile is what removes access; it is enough.
--
-- CONSEQUENCE, WORTH KNOWING BEFORE YOU CLICK
-- Because `createTeamMember` refuses any email that already has an account
-- (that refusal is the force-enrollment boundary — see the previous migration's
-- feature), a revoked person CANNOT be re-added through the form afterwards.
-- Their auth account still exists, so the form will refuse it. Re-adding needs
-- a different email address, or a human deleting the auth user in Supabase.
-- The UI states this at the point of the click rather than burying it here.
--
-- WHY RLS AND NOT A SERVICE-ROLE DELETE
-- The app deletes with the caller's own session, so the tenant boundary is
-- enforced by Postgres rather than by remembering to write the right `where`
-- clause. The service_role key bypasses RLS across every schema in the shared
-- project; it earns its place for creating an `auth.users` row, which RLS
-- cannot do, and nowhere else.

begin;

-- 1. Who may remove whom. Same tenant, users.manage, and never yourself:
--    removing your own membership is either an accident or a lockout, and the
--    UI cannot be the thing that prevents it.
create policy "Remove team members (users.manage)" on fast_route.profiles
  for delete to authenticated
  using (
    tenant_id = (select fast_route_private.tenant_id())
    and (select fast_route_private.has_permission('users.manage'))
    and id <> (select auth.uid())
  );

-- 2. A business must always keep an administrator.
--
--    This fires on DELETE and on a role change away from admin, because both
--    reach the same end state: nobody left who can manage users, and no way
--    back in from inside the app. `guard_role_change` only checks that the
--    CALLER may change roles — it has nothing to say about the last admin
--    demoting themselves.
--
--    SECURITY DEFINER so the count sees the whole tenant regardless of the
--    caller's policies; the check is about the business, not about what this
--    caller can see.
create or replace function fast_route_private.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_deleting boolean := tg_op = 'DELETE';
  v_still_admin boolean;
begin
  -- Branch explicitly instead of returning `case ... then old else new end`:
  -- NEW is not a real record in a DELETE trigger, and a construct that merely
  -- MENTIONS it there is the kind of thing that works until it does not.
  if v_deleting then
    if old.role <> 'admin' then
      return old;
    end if;
  else
    -- Only a demotion can strand the business; any other update is irrelevant.
    if old.role <> 'admin' or new.role = 'admin' then
      return new;
    end if;
  end if;

  select exists (
    select 1 from fast_route.profiles
    where tenant_id = old.tenant_id
      and role = 'admin'
      and id <> old.id
  ) into v_still_admin;

  if not v_still_admin then
    raise exception 'El negocio tiene que quedar con al menos un administrador';
  end if;

  if v_deleting then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_guard_last_admin on fast_route.profiles;
create trigger profiles_guard_last_admin
  before delete or update of role on fast_route.profiles
  for each row execute function fast_route_private.guard_last_admin();

commit;
