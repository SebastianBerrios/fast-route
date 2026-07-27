-- HOTFIX. Every RLS-protected query by a signed-in user was failing with
-- `permission denied for schema fast_route_private`.
--
-- WHAT BROKE
-- The previous migration moved 26 policies onto `fast_route_private.claims()`,
-- `.tenant_id()` and `.has_permission()`, and granted EXECUTE on those three to
-- `authenticated`. But EXECUTE is not reachable without USAGE on the schema
-- that contains the function, and `authenticated` has never had USAGE on
-- `fast_route_private` — it did not need it before, because the old policies
-- inlined `auth.jwt()`, and `auth` is a schema it can already use.
--
-- Policy expressions are evaluated with the querying user's privileges, so the
-- moment a policy called into that schema, every select/insert/update on every
-- fast_route table raised 42501 for real users.
--
-- WHY IT WAS NOT CAUGHT
-- The change was verified by calling the helpers over the SQL endpoint, which
-- runs as a privileged role that already has USAGE. It proved the helpers
-- return the right values; it never proved `authenticated` could reach them.
-- A privileged probe cannot answer a permissions question. The pgTAP suite
-- added alongside this migration runs `set local role authenticated`, which is
-- what surfaced this.
--
-- WHY NOT JUST `GRANT USAGE`
-- `fast_route_private` also holds the SECURITY DEFINER trigger functions
-- (`sync_role_to_app_metadata`, `guard_role_change`, `guard_last_admin`,
-- the stock ones), which carry EXECUTE for PUBLIC by Postgres default. They are
-- currently unreachable only because the schema door is shut. Opening that door
-- without closing the functions behind it would hand every signed-in user a
-- pile of definer-rights functions. Trigger functions do NOT need an EXECUTE
-- grant to fire — Postgres does not check it for trigger invocation — so
-- revoking is free.

begin;

-- 1. Let signed-in users reach the schema, because the policies now must.
grant usage on schema fast_route_private to authenticated;

-- 2. Close everything behind that door. PUBLIC's implicit EXECUTE is what would
--    otherwise become reachable; `authenticated` inherits from PUBLIC.
revoke execute on all functions in schema fast_route_private from public;
revoke execute on all functions in schema fast_route_private from authenticated;

-- 3. Reopen exactly the three claim accessors the policies call. They are
--    SECURITY INVOKER and read nothing but the caller's own JWT, so they leak
--    nothing the caller does not already hold.
grant execute on function fast_route_private.claims() to authenticated;
grant execute on function fast_route_private.tenant_id() to authenticated;
grant execute on function fast_route_private.has_permission(text) to authenticated;

-- 4. Anything added to this schema later must stay shut unless it is granted on
--    purpose, rather than inheriting PUBLIC's default.
alter default privileges in schema fast_route_private
  revoke execute on functions from public;

commit;
