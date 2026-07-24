-- Move the fast-route app out of the neutral `public` schema into its own
-- schemas, as the first step of a multi-app consolidation model where every
-- app owns a schema and `public` stays empty/neutral.
--
--   fast_route          -> exposed to the Data API (tables, enums, RPC)
--   fast_route_private  -> NOT exposed (trigger/helper functions only)
--
-- Triggers reference their functions by OID, so moving a function's schema does
-- not detach its triggers. But the function *bodies* hardcode `public.<table>`
-- and cross-schema helper calls, so every moved routine is recreated with its
-- internal references repointed at `fast_route` / `fast_route_private`.
--
-- NOTE (verified against migrations + live local DB): this project has NO
-- `rls_auto_enable` function and NO `ensure_rls` event trigger, so there is
-- nothing of that kind to update here. RLS stays enabled on the tables because
-- `ALTER TABLE ... SET SCHEMA` preserves RLS state, policies, and triggers.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schemas
-- ---------------------------------------------------------------------------
create schema if not exists fast_route;
create schema if not exists fast_route_private;

-- ---------------------------------------------------------------------------
-- 2. Move enum types (dependency from table columns is by OID, so this is safe
--    while the columns still reference them).
-- ---------------------------------------------------------------------------
alter type public.user_role    set schema fast_route;
alter type public.order_status set schema fast_route;
alter type public.stock_reason set schema fast_route;

-- ---------------------------------------------------------------------------
-- 3. Move tables. RLS flags, policies, indexes, FKs, and triggers travel with
--    the table. FKs to auth.users are cross-schema already and unaffected.
--    The 5 realtime tables stay in the supabase_realtime publication (tracked
--    by OID); realtime clients must now subscribe with schema = 'fast_route'.
-- ---------------------------------------------------------------------------
alter table public.tenants          set schema fast_route;
alter table public.profiles         set schema fast_route;
alter table public.products         set schema fast_route;
alter table public.customers        set schema fast_route;
alter table public.orders           set schema fast_route;
alter table public.order_items      set schema fast_route;
alter table public.stock_movements  set schema fast_route;
alter table public.driver_locations set schema fast_route;
alter table public.invites          set schema fast_route;

-- ---------------------------------------------------------------------------
-- 4. Move + repoint the private helper/trigger functions into
--    fast_route_private. Move first (preserves trigger attachment), then
--    CREATE OR REPLACE the body in the new schema with references repointed:
--      public.<table>                  -> fast_route.<table>
--      private.default_permissions(..) -> fast_route_private.default_permissions(..)
--    Every function keeps SET search_path TO '' so all refs stay fully
--    qualified. Argument/return types that moved to fast_route follow by OID.
-- ---------------------------------------------------------------------------
alter function private.set_updated_at()                          set schema fast_route_private;
alter function private.apply_stock_movement()                    set schema fast_route_private;
alter function private.deduct_stock_on_delivery()                set schema fast_route_private;
alter function private.set_order_delivery()                      set schema fast_route_private;
alter function private.check_stock_source()                      set schema fast_route_private;
alter function private.prevent_stock_pool_owner_deletion()       set schema fast_route_private;
alter function private.guard_role_change()                       set schema fast_route_private;
alter function private.sync_role_to_app_metadata()               set schema fast_route_private;
alter function private.default_permissions(fast_route.user_role) set schema fast_route_private;
alter function private.handle_new_user()                         set schema fast_route_private;

-- set_updated_at: no table refs, only NEW. Recreated in place for a uniform,
-- explicit pattern.
create or replace function fast_route_private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function fast_route_private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update fast_route.products
  set stock = stock + new.delta
  where id = new.product_id;
  return new;
end;
$function$;

create or replace function fast_route_private.deduct_stock_on_delivery()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  item record;
  pool_id uuid;
begin
  if new.status = 'delivered'
     and old.status is distinct from 'delivered'
     and not exists (
       select 1 from fast_route.stock_movements
       where order_id = new.id and reason = 'sale'
     ) then
    for item in
      select product_id, quantity
      from fast_route.order_items
      where order_id = new.id and product_id is not null
    loop
      select coalesce(p.stock_source_id, p.id) into pool_id
      from fast_route.products p
      where p.id = item.product_id;

      if pool_id is not null then
        insert into fast_route.stock_movements (product_id, delta, reason, order_id, created_by, note)
        values (pool_id, -item.quantity, 'sale', new.id, new.delivered_by, 'Venta entregada');
      end if;
    end loop;
  end if;
  return new;
end;
$function$;

create or replace function fast_route_private.set_order_delivery()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := now();
    new.delivered_by := (select auth.uid());
  elsif new.status <> 'delivered' then
    new.delivered_at := null;
    new.delivered_by := null;
  end if;
  return new;
end;
$function$;

create or replace function fast_route_private.check_stock_source()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  source fast_route.products%rowtype;
begin
  if new.stock_source_id is null then
    return new;
  end if;

  if new.stock_source_id = new.id then
    raise exception 'A product cannot use itself as its stock source';
  end if;

  -- Lock the source row before validating it, so a concurrent transaction
  -- cannot re-link the source (chain) or delete it while we check.
  select * into source
  from fast_route.products
  where id = new.stock_source_id
  for update;

  if not found then
    raise exception 'Stock source product does not exist';
  end if;

  if source.tenant_id is distinct from new.tenant_id then
    raise exception 'Stock source must belong to the same tenant';
  end if;

  if source.stock_source_id is not null then
    raise exception 'Stock source is already linked to another product (chains are not allowed)';
  end if;

  -- Reverse chain: this product is someone else's pool, so it cannot link
  -- out. Lock the dependents too so a concurrent link to this product
  -- serializes against this check.
  perform 1 from fast_route.products p
  where p.stock_source_id = new.id
  for update;

  if found then
    raise exception 'This product is a stock source for other products and cannot link to another pool';
  end if;

  return new;
end;
$function$;

create or replace function fast_route_private.prevent_stock_pool_owner_deletion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if exists (
    select 1 from fast_route.products p
    where p.stock_source_id = old.id
  ) then
    raise exception 'product is a stock pool for other products; unlink them first';
  end if;
  return old;
end;
$function$;

create or replace function fast_route_private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

create or replace function fast_route_private.sync_role_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;

-- default_permissions: argument type moved to fast_route.user_role. Keep the
-- signature aligned with the moved enum.
create or replace function fast_route_private.default_permissions(r fast_route.user_role)
returns text[]
language sql
immutable
set search_path to ''
as $function$
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
$function$;

create or replace function fast_route_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_tenant uuid;
  invite fast_route.invites;
  invite_code text;
begin
  invite_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');

  if invite_code is not null then
    select * into invite
    from fast_route.invites
    where code = invite_code and used_at is null and expires_at > now();

    if not found then
      raise exception 'Invitación inválida o expirada';
    end if;

    insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions)
    values (
      new.id,
      invite.tenant_id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      invite.role,
      fast_route_private.default_permissions(invite.role)
    );

    update fast_route.invites
    set used_at = now(), used_by = new.id
    where id = invite.id;

    return new;
  end if;

  -- No invite: create a new business, creator is its admin.
  insert into fast_route.tenants (name, city, country, center_lng, center_lat)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'business_name', ''), 'Mi negocio'),
    nullif(new.raw_user_meta_data ->> 'city', ''),
    nullif(new.raw_user_meta_data ->> 'country', ''),
    (nullif(new.raw_user_meta_data ->> 'center_lng', ''))::double precision,
    (nullif(new.raw_user_meta_data ->> 'center_lat', ''))::double precision
  )
  returning id into new_tenant;

  insert into fast_route.profiles (id, tenant_id, email, full_name, role, permissions)
  values (
    new.id,
    new_tenant,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'admin',
    fast_route_private.default_permissions('admin')
  );
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Move + repoint the exposed RPC into fast_route.
-- ---------------------------------------------------------------------------
alter function public.create_order_with_items(
  double precision, double precision, text, text, uuid, uuid, jsonb
) set schema fast_route;

create or replace function fast_route.create_order_with_items(
  p_lng double precision,
  p_lat double precision,
  p_customer_name text default null,
  p_note text default null,
  p_customer_id uuid default null,
  p_assigned_to uuid default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  v_order_id uuid;
  v_item jsonb;
begin
  if p_lng is null or p_lat is null
     or p_lng < -180 or p_lng > 180
     or p_lat < -90 or p_lat > 90 then
    raise exception 'Invalid coordinates: lng=%, lat=%', p_lng, p_lat;
  end if;

  insert into fast_route.orders (created_by, lng, lat, customer_name, note, customer_id, assigned_to)
  values (auth.uid(), p_lng, p_lat,
          nullif(p_customer_name, ''), nullif(p_note, ''), p_customer_id, p_assigned_to)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into fast_route.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (
      v_order_id,
      nullif(v_item ->> 'product_id', '')::uuid,
      coalesce(v_item ->> 'product_name', ''),
      coalesce((v_item ->> 'quantity')::numeric, 1),
      coalesce((v_item ->> 'unit_price')::numeric, 0)
    );
  end loop;

  return v_order_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Drop the now-empty `private` schema.
-- ---------------------------------------------------------------------------
drop schema if exists private restrict;

-- ---------------------------------------------------------------------------
-- 7. Grants.
--
-- fast_route is EXPOSED to the Data API: mirror the Supabase custom-schema
-- pattern. RLS on the tables is what actually gates row access; these grants
-- only make the schema reachable through PostgREST.
-- ---------------------------------------------------------------------------
grant usage on schema fast_route to anon, authenticated, service_role;
grant all on all tables    in schema fast_route to anon, authenticated, service_role;
grant all on all routines  in schema fast_route to anon, authenticated, service_role;
grant all on all sequences in schema fast_route to anon, authenticated, service_role;

alter default privileges for role postgres in schema fast_route
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema fast_route
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema fast_route
  grant all on sequences to anon, authenticated, service_role;

-- fast_route_private is NOT exposed. Do NOT grant usage to anon/authenticated.
-- All trigger functions here are SECURITY DEFINER (run as their owner,
-- postgres), and the only non-definer routine (default_permissions) is called
-- exclusively from a SECURITY DEFINER function, so no runtime grant to the API
-- roles is required. service_role keeps usage for administrative access.
grant usage on schema fast_route_private to service_role;

commit;
