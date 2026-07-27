-- Team members are created by an admin, not by the person signing themselves up.
--
-- WHY THE INVITE CODE GOES AWAY
-- The invite flow made membership depend on the invitee completing a signup:
-- the admin generated a code, handed it over out of band, and the person
-- created their own account with that code in their signup metadata. Two
-- consequences that a shared auth pool makes worse:
--
--   1. The code was a bearer token for membership. Anyone holding the link
--      became a member of that tenant with the role baked into the invite, no
--      matter who they actually were. The `email` column on invites was never
--      enforced against the signup address.
--   2. Membership creation lived on the invitee's side of the fence, so the
--      admin could not see the account exist until the invitee acted.
--
-- Oasis solved this by making the admin create the account outright: the
-- profile row (which IS the membership) and the auth user are both written
-- server-side with the service_role key, and no self-service path exists.
-- fast_route now does the same for team members — see
-- src/features/admin/actions.ts (createTeamMember).
--
-- WHAT STAYS SELF-SERVICE
-- Creating a NEW business. That is the only way a tenant comes into existence,
-- and the person doing it becomes its admin. enroll_self() keeps exactly that
-- branch and loses the invite branch.

-- 1. The invite table and everything hanging off it (policies, indexes) go.
--    Any unused codes still outstanding stop working, which is the intent:
--    they were bearer tokens for membership.
drop table if exists fast_route.invites;

-- 2. enroll_self() without the invite branch. Still namespaced under
--    `fast_route` in the user metadata so no other fleet app's signup can drive
--    membership here, still idempotent, still a no-op without a signup intent.
--    A team member created by an admin already has a profile, so their first
--    session returns at the idempotency check.
create or replace function fast_route.enroll_self()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_meta jsonb;
  v_intent jsonb;
  v_business_name text;
  v_new_tenant uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize concurrent enrollments for the same user (double-submit / retry)
  -- so the exists() check and the inserts below cannot race into a duplicate
  -- profile or an orphan tenant. Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Idempotent: an existing member is left untouched (no duplicate tenant).
  -- This is also the path every admin-created team member takes.
  if exists (select 1 from fast_route.profiles where id = v_uid) then
    return;
  end if;

  select email, raw_user_meta_data into v_email, v_meta
  from auth.users where id = v_uid;

  -- Enrollment intent is namespaced under a fast_route-specific key so it can
  -- only originate from THIS app's signup form. Other fleet apps writing generic
  -- top-level keys in the shared user_metadata cannot trigger enrollment here.
  v_intent := v_meta -> 'fast_route';
  v_business_name := nullif(v_intent ->> 'business_name', '');

  -- No fast_route signup intent means this session did not come from the
  -- fast_route signup form. Do nothing: identity without membership.
  if v_business_name is null then
    return;
  end if;

  -- New business: the creator is its admin. Role is hardcoded, never read from
  -- client input.
  insert into fast_route.tenants (name, city, country, center_lng, center_lat)
  values (
    v_business_name,
    nullif(v_intent ->> 'city', ''),
    nullif(v_intent ->> 'country', ''),
    (nullif(v_intent ->> 'center_lng', ''))::double precision,
    (nullif(v_intent ->> 'center_lat', ''))::double precision
  )
  returning id into v_new_tenant;

  insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions)
  values (
    v_uid,
    v_new_tenant,
    v_email,
    coalesce(v_meta ->> 'full_name', ''),
    'admin',
    fast_route_private.default_permissions('admin')
  );
end;
$function$;

revoke all on function fast_route.enroll_self() from public;
grant execute on function fast_route.enroll_self() to authenticated;
