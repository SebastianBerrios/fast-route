-- Move fast_route enrollment off the shared auth.users trigger and into an
-- explicit, app-invoked RPC.
--
-- WHY: mvp-lab apps share ONE auth.users pool. A trigger on auth.users owned by
-- fast_route fired on EVERY fleet signup (ez_finance, oasis, ...), auto-creating
-- a fast_route tenant + admin profile and writing fast_route claims into the
-- fleet-global app_metadata for users who never touched this app. Authentication
-- is NOT membership: membership must be an explicit action taken inside
-- fast_route, never a side effect of existing in the shared pool.
--
-- WHAT: drop the auth.users trigger and its handler; expose enrollment as
-- fast_route.enroll_self(), which the app calls on the first authenticated
-- session. The enrollment intent is read from a fast_route-NAMESPACED key in the
-- user's metadata (raw_user_meta_data -> 'fast_route'), so generic top-level keys
-- written by any other fleet app can never drive enrollment here. It is
-- idempotent and a no-op when that namespaced intent is absent.

-- 1. Remove the fleet-wide enrollment side effect.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists fast_route_private.handle_new_user();

-- 2. Explicit, self-service enrollment. Mirrors the old handler's two branches
--    (redeem invite -> join existing tenant; else create a new business as its
--    admin) but runs only when the fast_route app invokes it for the current
--    user, and only when a fast_route-namespaced signup intent is present. Role
--    is never taken from client input: it comes from the invite row or is
--    hardcoded 'admin' for a brand-new business.
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
  v_invite_code text;
  v_business_name text;
  v_invite fast_route.invites;
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
  if exists (select 1 from fast_route.profiles where id = v_uid) then
    return;
  end if;

  select email, raw_user_meta_data into v_email, v_meta
  from auth.users where id = v_uid;

  -- Enrollment intent is namespaced under a fast_route-specific key so it can
  -- only originate from THIS app's signup form. Other fleet apps writing generic
  -- top-level keys in the shared user_metadata cannot trigger enrollment here.
  v_intent := v_meta -> 'fast_route';
  v_invite_code := nullif(v_intent ->> 'invite_code', '');
  v_business_name := nullif(v_intent ->> 'business_name', '');

  -- No fast_route signup intent means this session did not come from the
  -- fast_route signup form. Do nothing: identity without membership.
  if v_invite_code is null and v_business_name is null then
    return;
  end if;

  if v_invite_code is not null then
    -- Lock the invite row so a single-use code cannot be redeemed twice by two
    -- concurrent enrollments.
    select * into v_invite
    from fast_route.invites
    where code = v_invite_code and used_at is null and expires_at > now()
    for update;

    if not found then
      raise exception 'Invitación inválida o expirada';
    end if;

    insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions)
    values (
      v_uid,
      v_invite.tenant_id,
      v_email,
      coalesce(v_meta ->> 'full_name', ''),
      v_invite.role,
      fast_route_private.default_permissions(v_invite.role)
    );

    update fast_route.invites
    set used_at = now(), used_by = v_uid
    where id = v_invite.id;

    return;
  end if;

  -- No invite: create a new business, creator is its admin.
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

-- 3. Only signed-in users may enroll themselves (the function self-guards on
--    auth.uid(), so an anon call would raise anyway).
revoke all on function fast_route.enroll_self() from public;
grant execute on function fast_route.enroll_self() to authenticated;
