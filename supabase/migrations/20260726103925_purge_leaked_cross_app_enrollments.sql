-- Remediate the data already leaked by the (now-removed) auth.users trigger.
--
-- Two accounts from OTHER fleet apps were auto-enrolled into fast_route as admins
-- of their own junk tenants, and carry fast_route claims in the shared
-- app_metadata:
--   * qa.oasis@example.com      -- Oasis QA account
--   * giulianalevav@gmail.com   -- the Oasis product's client
-- Neither belongs in fast_route. This removes ONLY their fast_route membership,
-- junk tenant, and fast_route claims. Their auth.users accounts are left intact
-- (they belong to Oasis). Run AFTER the trigger-removal migration is deployed.
--
-- Idempotent and guarded: affects zero rows if already clean or if run locally
-- (via `supabase db reset`) where these accounts do not exist. A junk tenant is
-- deleted only when it is genuinely empty, so a surprising leftover row leaves
-- the tenant in place rather than failing the migration.

do $$
declare
  v_leaked uuid[];
  v_tenants uuid[];
begin
  select array_agg(u.id) into v_leaked
  from auth.users u
  where u.email in ('qa.oasis@example.com', 'giulianalevav@gmail.com');

  if v_leaked is null then
    return; -- nothing to purge (e.g. fresh local database)
  end if;

  -- The junk tenants these leaked profiles own (created by the old trigger).
  select array_agg(distinct p.tenant_id) into v_tenants
  from fast_route.profiles p
  where p.id = any(v_leaked);

  -- 1. Remove the membership rows (this also clears their FK to the junk tenant).
  delete from fast_route.profiles where id = any(v_leaked);

  -- 2. Remove the now-orphan junk tenants, but only if truly empty. If anything
  --    still references a tenant, leave it (a harmless orphan) rather than fail.
  if v_tenants is not null then
    delete from fast_route.tenants t
    where t.id = any(v_tenants)
      and not exists (select 1 from fast_route.profiles         x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.orders           x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.order_items      x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.customers        x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.products         x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.stock_movements  x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.invites          x where x.tenant_id = t.id)
      and not exists (select 1 from fast_route.driver_locations x where x.tenant_id = t.id);
  end if;

  -- 3. Scrub the fast_route claims from the fleet-global app_metadata, leaving
  --    other keys (provider/providers) untouched.
  --    Verified safe (2026-07-26): no fleet schema other than fast_route reads
  --    app_metadata in its RLS (Oasis authorizes via oasis.profiles), and for
  --    both accounts role/tenant_id/permissions hold ONLY fast_route's junk-tenant
  --    values. giulianalevav's real Oasis access lives in oasis.profiles, which
  --    this migration does not touch, so removing these keys cannot affect it.
  update auth.users
  set raw_app_meta_data = raw_app_meta_data - 'role' - 'tenant_id' - 'permissions'
  where id = any(v_leaked);
end $$;
