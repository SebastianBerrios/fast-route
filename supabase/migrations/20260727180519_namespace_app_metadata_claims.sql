-- Move fast_route's JWT claims under an app-namespaced key, and stop reading
-- them from 25 hand-copied places.
--
-- THE RULE THIS FIXES
-- `app_metadata` is ONE fleet-global blob shared by every app in the mvp-lab
-- project. fast_route wrote `role`, `tenant_id` and `permissions` at the TOP
-- LEVEL of it, so any other app writing a claim by an obvious name would
-- silently collide with fast_route's authorization data — and vice versa. The
-- workspace rule is explicit: namespace every claim under the app key. Claims
-- now live at `app_metadata -> 'fast_route'`.
--
-- Verified before writing this: `fast_route_private.sync_role_to_app_metadata`
-- is the ONLY function in the entire project that writes `raw_app_meta_data`,
-- and the 4 users carrying top-level claims are exactly the 4 fast_route
-- members. So removing the top-level keys cannot take another app's data with
-- it.
--
-- THE SECOND PROBLEM, WHICH IS WHY THIS WAS SCARY
-- The claim accessor was copy-pasted into 25 policies across 8 tables. A change
-- of storage location meant editing 25 boolean expressions by hand, where one
-- typo either locks everyone out or, far worse, silently widens access. The
-- policies now call three helper functions instead, so the next time the claim
-- shape changes it is one edit, not 25.
--
-- The rewritten policy bodies were generated from `pg_policies` and verified to
-- contain zero remaining references to `app_metadata` before being written here
-- — not retyped by hand.
--
-- OPERATIONAL NOTE
-- Sessions already signed in hold a token with the OLD top-level claims. Until
-- that token refreshes, `fast_route_private.tenant_id()` returns null for them
-- and they see no rows. `SessionSync` refreshes on tab focus (and the token
-- expires within the hour), so this resolves itself; a sign-out/sign-in is the
-- instant fix.

begin;

-- ---------------------------------------------------------------------------
-- 1. The claim accessors. One definition each, so there is exactly one place to
--    change if the shape ever moves again.
--
--    SECURITY INVOKER (the default) is required, not incidental: these must
--    read the CALLING user's JWT. Marked STABLE so the planner can hoist them
--    out of per-row evaluation when the policies wrap them in a subselect.
-- ---------------------------------------------------------------------------

create or replace function fast_route_private.claims()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select coalesce(auth.jwt() -> 'app_metadata' -> 'fast_route', '{}'::jsonb)
$function$;

comment on function fast_route_private.claims() is
  'fast_route''s namespaced slice of the fleet-global app_metadata blob.';

create or replace function fast_route_private.tenant_id()
returns uuid
language sql
stable
set search_path to ''
as $function$
  select nullif(fast_route_private.claims() ->> 'tenant_id', '')::uuid
$function$;

comment on function fast_route_private.tenant_id() is
  'The caller''s business, or null for an authenticated non-member. Null never matches a tenant_id column, so a non-member sees no rows.';

create or replace function fast_route_private.has_permission(p text)
returns boolean
language sql
stable
set search_path to ''
as $function$
  select coalesce(fast_route_private.claims() -> 'permissions' ? p, false)
$function$;

comment on function fast_route_private.has_permission(text) is
  'Whether the caller holds a granular permission. False when the claim is absent, never null.';

revoke all on function fast_route_private.claims() from public;
revoke all on function fast_route_private.tenant_id() from public;
revoke all on function fast_route_private.has_permission(text) from public;
grant execute on function fast_route_private.claims() to authenticated;
grant execute on function fast_route_private.tenant_id() to authenticated;
grant execute on function fast_route_private.has_permission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Write claims into the namespace, and strip the top-level copies as we go.
--    The strip is safe per the verification in the header, and it means a
--    profile touched later cannot resurrect the old shape.
-- ---------------------------------------------------------------------------

create or replace function fast_route_private.sync_role_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update auth.users
  set raw_app_meta_data =
        (coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' - 'tenant_id' - 'permissions')
        || jsonb_build_object(
             'fast_route',
             coalesce(raw_app_meta_data -> 'fast_route', '{}'::jsonb)
               || jsonb_build_object(
                    'role', new.role,
                    'tenant_id', new.tenant_id,
                    'permissions', to_jsonb(new.permissions)
                  )
           )
  where id = new.id;
  return new;
end;
$function$;

-- The role-change guard reads the caller's permission the same way the policies
-- did, so it moves to the helper too. Without this it would read a top-level
-- claim that no longer exists and block every legitimate role change.
create or replace function fast_route_private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not fast_route_private.has_permission('users.manage') then
    raise exception 'Solo un usuario con gestión de usuarios puede cambiar roles';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Backfill the existing members. Driven from `profiles`, which is the source
--    of truth for membership — not from whatever happens to be in the blob.
-- ---------------------------------------------------------------------------

update auth.users u
set raw_app_meta_data =
      (coalesce(u.raw_app_meta_data, '{}'::jsonb) - 'role' - 'tenant_id' - 'permissions')
      || jsonb_build_object(
           'fast_route',
           coalesce(u.raw_app_meta_data -> 'fast_route', '{}'::jsonb)
             || jsonb_build_object(
                  'role', p.role,
                  'tenant_id', p.tenant_id,
                  'permissions', to_jsonb(p.permissions)
                )
         )
from fast_route.profiles p
where p.id = u.id;

-- Anyone else still carrying fast_route's top-level keys is not a member, so
-- the keys are leftovers. (The cross-app purge already cleared the known ones;
-- this makes the invariant hold unconditionally.)
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'role' - 'tenant_id' - 'permissions'
where (raw_app_meta_data ? 'role'
       or raw_app_meta_data ? 'tenant_id'
       or raw_app_meta_data ? 'permissions')
  and id not in (select id from fast_route.profiles);

-- ---------------------------------------------------------------------------
-- 4. Every policy that read a claim, rewritten to call the helpers. Same
--    predicates, same semantics — only the accessor changed.
-- ---------------------------------------------------------------------------

drop policy if exists "Create customers (customers.manage)" on fast_route.customers;
create policy "Create customers (customers.manage)" on fast_route.customers for insert to authenticated
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (( SELECT auth.uid() AS uid) = created_by) AND (( SELECT fast_route_private.has_permission('customers.manage')))));

drop policy if exists "Delete customers (manage/owner)" on fast_route.customers;
create policy "Delete customers (manage/owner)" on fast_route.customers for delete to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND ((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT fast_route_private.has_permission('customers.manage'))))));

drop policy if exists "Update customers (manage/owner)" on fast_route.customers;
create policy "Update customers (manage/owner)" on fast_route.customers for update to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND ((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT fast_route_private.has_permission('customers.manage'))))))
  with check ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "View customers in my tenant" on fast_route.customers;
create policy "View customers in my tenant" on fast_route.customers for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Insert own location" on fast_route.driver_locations;
create policy "Insert own location" on fast_route.driver_locations for insert to authenticated
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (user_id = ( SELECT auth.uid() AS uid))));

drop policy if exists "Update own location" on fast_route.driver_locations;
create policy "Update own location" on fast_route.driver_locations for update to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (user_id = ( SELECT auth.uid() AS uid))));

drop policy if exists "View tenant driver locations" on fast_route.driver_locations;
create policy "View tenant driver locations" on fast_route.driver_locations for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Delete order items (own order or manage)" on fast_route.order_items;
create policy "Delete order items (own order or manage)" on fast_route.order_items for delete to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (EXISTS ( SELECT 1
   FROM fast_route.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT fast_route_private.has_permission('orders.manage')))))))));

drop policy if exists "Insert order items (own order or manage)" on fast_route.order_items;
create policy "Insert order items (own order or manage)" on fast_route.order_items for insert to authenticated
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (EXISTS ( SELECT 1
   FROM fast_route.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT fast_route_private.has_permission('orders.manage')))))))));

drop policy if exists "Update order items (own order or manage)" on fast_route.order_items;
create policy "Update order items (own order or manage)" on fast_route.order_items for update to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (EXISTS ( SELECT 1
   FROM fast_route.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT fast_route_private.has_permission('orders.manage')))))))))
  with check ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "View order items in my tenant" on fast_route.order_items;
create policy "View order items in my tenant" on fast_route.order_items for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Create orders (orders.create)" on fast_route.orders;
create policy "Create orders (orders.create)" on fast_route.orders for insert to authenticated
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (( SELECT auth.uid() AS uid) = created_by) AND (( SELECT fast_route_private.has_permission('orders.create')))));

drop policy if exists "Delete orders (manage/owner)" on fast_route.orders;
create policy "Delete orders (manage/owner)" on fast_route.orders for delete to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND ((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT fast_route_private.has_permission('orders.manage'))))));

drop policy if exists "Update orders (deliver/manage/owner)" on fast_route.orders;
create policy "Update orders (deliver/manage/owner)" on fast_route.orders for update to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND ((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT fast_route_private.has_permission('orders.deliver'))) OR (( SELECT fast_route_private.has_permission('orders.manage'))))))
  with check ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "View orders in my tenant" on fast_route.orders;
create policy "View orders in my tenant" on fast_route.orders for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Create products (products.manage)" on fast_route.products;
create policy "Create products (products.manage)" on fast_route.products for insert to authenticated
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (( SELECT auth.uid() AS uid) = created_by) AND (( SELECT fast_route_private.has_permission('products.manage')))));

drop policy if exists "Delete products (manage/owner)" on fast_route.products;
create policy "Delete products (manage/owner)" on fast_route.products for delete to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND ((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT fast_route_private.has_permission('products.manage'))))));

drop policy if exists "Update products (manage/owner)" on fast_route.products;
create policy "Update products (manage/owner)" on fast_route.products for update to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND ((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT fast_route_private.has_permission('products.manage'))))))
  with check ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "View products in my tenant" on fast_route.products;
create policy "View products in my tenant" on fast_route.products for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Manage profiles (users.manage)" on fast_route.profiles;
create policy "Manage profiles (users.manage)" on fast_route.profiles for update to authenticated
  using (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (( SELECT fast_route_private.has_permission('users.manage')))))
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (( SELECT fast_route_private.has_permission('users.manage')))));

drop policy if exists "Update own profile" on fast_route.profiles;
create policy "Update own profile" on fast_route.profiles for update to authenticated
  using (((id = ( SELECT auth.uid() AS uid)) AND (tenant_id = ( SELECT fast_route_private.tenant_id()))))
  with check (((id = ( SELECT auth.uid() AS uid)) AND (tenant_id = ( SELECT fast_route_private.tenant_id()))));

drop policy if exists "View profiles in my tenant" on fast_route.profiles;
create policy "View profiles in my tenant" on fast_route.profiles for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Record stock movements (products.manage)" on fast_route.stock_movements;
create policy "Record stock movements (products.manage)" on fast_route.stock_movements for insert to authenticated
  with check (((tenant_id = ( SELECT fast_route_private.tenant_id())) AND (( SELECT auth.uid() AS uid) = created_by) AND (( SELECT fast_route_private.has_permission('products.manage')))));

drop policy if exists "View stock movements in my tenant" on fast_route.stock_movements;
create policy "View stock movements in my tenant" on fast_route.stock_movements for select to authenticated
  using ((tenant_id = ( SELECT fast_route_private.tenant_id())));

drop policy if exists "Members view their tenant" on fast_route.tenants;
create policy "Members view their tenant" on fast_route.tenants for select to authenticated
  using ((id = ( SELECT fast_route_private.tenant_id())));

commit;
