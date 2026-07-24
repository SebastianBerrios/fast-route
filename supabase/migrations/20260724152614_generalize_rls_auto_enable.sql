-- Generalize the RLS auto-enable safety net via a schema registry.
--
-- BACKGROUND
-- The REMOTE database carries an event-trigger safety net that was applied
-- directly via execute_sql and never captured in a migration (confirmed drift):
--
--   public.rls_auto_enable()   SECURITY DEFINER, returns event_trigger
--   event trigger ensure_rls   ON ddl_command_end EXECUTE public.rls_auto_enable()
--
-- The remote function hardcoded a single schema: `cmd.schema_name IN ('public')`.
-- That does not cover this app after it moved into the `fast_route` schema, so a
-- CREATE TABLE in `fast_route` would NOT get RLS auto-enabled.
--
-- This migration GENERALIZES the net through a registry table
-- (`public.rls_managed_schemas`) and re-versions both objects. Because it uses
-- `create table if not exists`, `create or replace function`, and drop/create for
-- the event trigger, it is idempotent against the remote objects that already
-- exist: when later pushed, it cleanly OVERWRITES the drift with this versioned
-- definition. Neither object exists locally yet, so locally it simply creates them.
--
-- ORDERING (important — avoids self-recursion during this migration):
-- If the OLD-style `ensure_rls` trigger is active on remote while this runs, it
-- would fire on `create table public.rls_managed_schemas`. We therefore DROP the
-- event trigger at the very START, do all the work with the trigger inert, and
-- (re)CREATE the trigger LAST. Locally the trigger does not exist yet, so the
-- leading `drop ... if exists` is a harmless no-op.

begin;

-- ---------------------------------------------------------------------------
-- 0. Disarm any existing (old-style) event trigger so nothing fires while we
--    build the registry. No-op locally; removes the drift trigger on remote.
--    Event triggers have no CREATE OR REPLACE, so drop/create is the only path.
-- ---------------------------------------------------------------------------
drop event trigger if exists ensure_rls;

-- ---------------------------------------------------------------------------
-- 1. Registry of schemas whose new tables should get RLS auto-enabled.
--    Lives in `public` intentionally: this is shared/global infra config, not
--    app data. It is NOT granted to anon/authenticated, so it stays invisible
--    to the Data API. Only the SECURITY DEFINER function (as owner) and
--    service_role read it.
-- ---------------------------------------------------------------------------
create table if not exists public.rls_managed_schemas (
  schema_name text primary key
);

comment on table public.rls_managed_schemas is
  'Infra registry: schemas whose newly created tables are automatically '
  'granted RLS by the public.rls_auto_enable() event trigger. NOT exposed to '
  'the Data API (no anon/authenticated grants). To opt a schema in: '
  'insert into public.rls_managed_schemas (schema_name) values (''<schema>'') '
  'on conflict do nothing;';

-- ---------------------------------------------------------------------------
-- 2. Seed the schemas this project manages. `on conflict do nothing` keeps the
--    migration idempotent against a remote registry that may already hold rows.
-- ---------------------------------------------------------------------------
insert into public.rls_managed_schemas (schema_name) values
  ('public'),
  ('fast_route')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. (Re)define the event-trigger function. Same baseline logic as the remote
--    drift, but the single hardcoded schema is replaced by a lookup against the
--    registry. Kept SECURITY DEFINER so it can enable RLS regardless of the
--    invoking role. search_path is pinned to `public, pg_catalog` so the
--    unqualified registry read resolves deterministically and cannot be hijacked
--    (public.rls_managed_schemas is also fully qualified below for clarity).
--    The per-table EXCEPTION WHEN OTHERS keeps one failure from aborting the
--    whole DDL, and RAISE LOG preserves observability.
-- ---------------------------------------------------------------------------
create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in (select schema_name from public.rls_managed_schemas)
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %: %', cmd.object_identity, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;

comment on function public.rls_auto_enable() is
  'Event-trigger function (ddl_command_end): auto-enables RLS on newly created '
  'tables whose schema is registered in public.rls_managed_schemas. '
  'SECURITY DEFINER; per-table errors are logged, not raised.';

-- ---------------------------------------------------------------------------
-- 4. Arm the event trigger LAST, once the registry and function are in place.
--    Created here (not earlier) so it never fires on our own registry DDL above.
-- ---------------------------------------------------------------------------
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

-- Note on rls_managed_schemas itself: it was created in `public` (a registered
-- schema) while the trigger was disarmed, so RLS was NOT auto-enabled on it, and
-- we deliberately leave it that way. It has no anon/authenticated grants, so it
-- is unreachable via the Data API regardless; only the SECURITY DEFINER function
-- (as owner) and service_role touch it.

commit;
