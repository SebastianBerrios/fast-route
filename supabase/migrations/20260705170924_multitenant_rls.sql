-- ============================================================
-- Rewrite every policy to enforce tenant isolation.
-- current tenant = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
-- ============================================================

-- ---------- profiles ----------
drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Owners can update their own profile" on public.profiles;
drop policy if exists "Admins view all profiles" on public.profiles;
drop policy if exists "Admins update any profile" on public.profiles;
drop policy if exists "Staff can view the team directory" on public.profiles;

create policy "View profiles in my tenant"
  on public.profiles for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Update own profile"
  on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    and tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  )
  with check (
    id = (select auth.uid())
    and tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

create policy "Admins update any profile in tenant"
  on public.profiles for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ---------- customers ----------
drop policy if exists "Staff can view customers" on public.customers;
drop policy if exists "Staff can create customers" on public.customers;
drop policy if exists "Owner or admin can update customers" on public.customers;
drop policy if exists "Owner or admin can delete customers" on public.customers;

create policy "View customers in my tenant"
  on public.customers for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Create customers in my tenant"
  on public.customers for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
  );

create policy "Update customers (owner or admin)"
  on public.customers for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and ((select auth.uid()) = created_by
         or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete customers (owner or admin)"
  on public.customers for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and ((select auth.uid()) = created_by
         or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- ---------- products ----------
drop policy if exists "Staff can view products" on public.products;
drop policy if exists "Staff can create products" on public.products;
drop policy if exists "Owner or admin can update products" on public.products;
drop policy if exists "Owner or admin can delete products" on public.products;

create policy "View products in my tenant"
  on public.products for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Create products in my tenant"
  on public.products for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
  );

create policy "Update products (owner or admin)"
  on public.products for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and ((select auth.uid()) = created_by
         or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete products (owner or admin)"
  on public.products for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and ((select auth.uid()) = created_by
         or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- ---------- orders ----------
drop policy if exists "Staff can view orders" on public.orders;
drop policy if exists "Staff can create orders" on public.orders;
drop policy if exists "Update own or as admin/driver" on public.orders;
drop policy if exists "Delete own or as admin" on public.orders;

create policy "View orders in my tenant"
  on public.orders for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Create orders in my tenant"
  on public.orders for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
  );

create policy "Update orders (owner, admin or driver)"
  on public.orders for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and ((select auth.uid()) = created_by
         or (select auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'driver'))
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete orders (owner or admin)"
  on public.orders for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and ((select auth.uid()) = created_by
         or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- ---------- order_items ----------
drop policy if exists "Staff view order items" on public.order_items;
drop policy if exists "Manage items on own orders (insert)" on public.order_items;
drop policy if exists "Manage items on own orders (update)" on public.order_items;
drop policy if exists "Manage items on own orders (delete)" on public.order_items;

create policy "View order items in my tenant"
  on public.order_items for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Insert order items on manageable orders"
  on public.order_items for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by = (select auth.uid())
             or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

create policy "Update order items on manageable orders"
  on public.order_items for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by = (select auth.uid())
             or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete order items on manageable orders"
  on public.order_items for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by = (select auth.uid())
             or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

-- ---------- stock_movements ----------
drop policy if exists "Staff view stock movements" on public.stock_movements;
drop policy if exists "Staff record stock movements" on public.stock_movements;

create policy "View stock movements in my tenant"
  on public.stock_movements for select to authenticated
  using (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Record stock movements in my tenant"
  on public.stock_movements for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
  );