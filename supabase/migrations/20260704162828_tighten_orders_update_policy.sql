-- Replace the overly-permissive UPDATE policy (using/with check = true) with
-- an ownership-scoped one. Cross-role updates (e.g. a driver marking another
-- user's order delivered) will be added in the roles slice via JWT app_metadata.
drop policy "Staff can update orders" on public.orders;

create policy "Creators can update their own orders"
  on public.orders for update
  to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);