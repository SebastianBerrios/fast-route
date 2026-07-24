-- Secure the RLS auto-enable registry.
--
-- public.rls_managed_schemas lives in `public`, which is exposed to the Data API.
-- It was created (in generalize_rls_auto_enable) while the auto-enable trigger was
-- disarmed, so it never received RLS -- meaning anon/authenticated could read it via
-- the API. It only holds schema names (low sensitivity), but an infra config table
-- has no business being reachable through the Data API.
--
-- Enabling RLS with NO policies denies all API roles (zero rows). The
-- public.rls_auto_enable() function keeps working because it is SECURITY DEFINER and
-- runs as the table owner (postgres), which bypasses RLS. We also revoke the default
-- public-schema grants from the API roles for defense in depth.

alter table public.rls_managed_schemas enable row level security;

revoke all on public.rls_managed_schemas from anon, authenticated;
