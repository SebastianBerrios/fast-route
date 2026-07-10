-- Permission-aware write policies. Tenant scoping preserved.
-- perm(x) = (auth.jwt() -> 'app_metadata' -> 'permissions') ? 'x'
-- Admins naturally pass because their permission set contains every action.

-- ---------- orders ----------
drop policy if exists "Create orders in my tenant" on public.orders;
drop policy if exists "Update orders (owner, admin or driver)" on public.orders;
drop policy if exists "Delete orders (owner or admin)" on public.orders;

create policy "Create orders (orders.create)"
  on public.orders for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.create'
  );

create policy "Update orders (deliver/manage/owner)"
  on public.orders for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (select auth.uid()) = created_by
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.deliver'
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.manage'
    )
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete orders (manage/owner)"
  on public.orders for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (select auth.uid()) = created_by
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.manage'
    )
  );

-- ---------- customers ----------
drop policy if exists "Create customers in my tenant" on public.customers;
drop policy if exists "Update customers (owner or admin)" on public.customers;
drop policy if exists "Delete customers (owner or admin)" on public.customers;

create policy "Create customers (customers.manage)"
  on public.customers for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'customers.manage'
  );

create policy "Update customers (manage/owner)"
  on public.customers for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (select auth.uid()) = created_by
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'customers.manage'
    )
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete customers (manage/owner)"
  on public.customers for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (select auth.uid()) = created_by
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'customers.manage'
    )
  );

-- ---------- products ----------
drop policy if exists "Create products in my tenant" on public.products;
drop policy if exists "Update products (owner or admin)" on public.products;
drop policy if exists "Delete products (owner or admin)" on public.products;

create policy "Create products (products.manage)"
  on public.products for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'products.manage'
  );

create policy "Update products (manage/owner)"
  on public.products for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (select auth.uid()) = created_by
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'products.manage'
    )
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete products (manage/owner)"
  on public.products for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (select auth.uid()) = created_by
      or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'products.manage'
    )
  );

-- ---------- stock_movements ----------
drop policy if exists "Record stock movements in my tenant" on public.stock_movements;

create policy "Record stock movements (products.manage)"
  on public.stock_movements for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.uid()) = created_by
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'products.manage'
  );

-- ---------- order_items ----------
drop policy if exists "Insert order items on manageable orders" on public.order_items;
drop policy if exists "Update order items on manageable orders" on public.order_items;
drop policy if exists "Delete order items on manageable orders" on public.order_items;

create policy "Insert order items (own order or manage)"
  on public.order_items for insert to authenticated
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by = (select auth.uid())
             or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.manage')
    )
  );

create policy "Update order items (own order or manage)"
  on public.order_items for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by = (select auth.uid())
             or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.manage')
    )
  )
  with check (tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy "Delete order items (own order or manage)"
  on public.order_items for delete to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.created_by = (select auth.uid())
             or (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'orders.manage')
    )
  );

-- ---------- profiles (admin management now = users.manage) ----------
drop policy if exists "Admins update any profile in tenant" on public.profiles;

create policy "Manage profiles (users.manage)"
  on public.profiles for update to authenticated
  using (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'users.manage'
  )
  with check (
    tenant_id = (select auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (select auth.jwt() -> 'app_metadata' -> 'permissions') ? 'users.manage'
  );