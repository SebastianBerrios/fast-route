# Supabase operations

This project (`mvp-lab`, ref `vzxrsvqnxkoiuwvdozxv`) hosts multiple apps in one
Supabase project, one schema per app. This file is the operational contract.

## Schema model

| Schema             | Purpose                                          | Data API |
| ------------------ | ------------------------------------------------ | -------- |
| `public`           | Neutral / shared infra only (no app data)        | exposed  |
| `fast_route`       | App tables, enums, and public RPCs               | exposed  |
| `fast_route_private` | Internal trigger/helper functions              | NOT exposed |

Every new app follows the same shape: `<app>` (exposed) + `<app>_private`
(internal). `public` never holds app data — only shared infrastructure (the
RLS registry below).

## Local development

- `pnpm supabase start` — full local stack (Docker).
- `pnpm supabase db reset` — replay every migration on a clean local DB.
- `.env.development.local` points the app at the local stack; it overrides
  `.env.local` only under `pnpm dev`. Delete it to run against remote.

## Applying schema changes to remote

1. Write a migration in `supabase/migrations/`.
2. Validate locally: `pnpm supabase db reset`.
3. Apply to remote: `pnpm supabase db push`.

NEVER change the remote schema with ad-hoc SQL / `execute_sql`. That creates
drift (remote objects absent from migrations). Everything goes through
migrations + `db push` so the repo stays the source of truth.

## Exposed schemas (remote) — managed via SQL, not the Dashboard

Exposed schemas were set once via SQL, so the Dashboard no longer manages them.
To change the exposed schema list on remote:

```sql
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, fast_route';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
```

Both reloads are required:
- `reload config` picks up the new schema list.
- `reload schema` refreshes the table cache — without it, requests fail with
  `PGRST205` ("Could not find the table ... in the schema cache").

## RLS auto-enable safety net

- Event trigger `ensure_rls` runs `public.rls_auto_enable()` on `ddl_command_end`.
- It auto-enables RLS on any new table whose schema is listed in
  `public.rls_managed_schemas`.
- The registry itself has RLS enabled and no API grants (infra config, never
  reachable through the Data API).

## Onboarding a NEW app into this project

1. Migration: `create schema <app>;` + `create schema <app>_private;` plus the
   grants used for `fast_route` (usage + table/routine/sequence grants + default
   privileges on the exposed schema; nothing to anon/authenticated on `_private`).
2. Register it for auto-RLS:
   ```sql
   insert into public.rls_managed_schemas (schema_name) values ('<app>')
   on conflict do nothing;
   ```
3. Expose it (SQL block above), adding `<app>` to the `pgrst.db_schemas` list,
   then both reloads.
4. In the app's Supabase client: `createClient(url, key, { db: { schema: '<app>' } })`,
   and set realtime `postgres_changes` filters to `schema: '<app>'`.

## Shared limits & when to graduate an app

Every app in this project shares ONE quota and ONE fate:
- Free plan: 500 MB database, 1 GB storage, nano compute, 50k MAU — total across all schemas.
- Single point of failure: an incident here affects every app.
- Single auth pool: all apps share `auth.users` and the same JWT secret. The only
  boundary between apps is RLS + per-app scoping (e.g. `tenant_id` / `app_metadata`).

Graduate an app to its OWN project (or a Hetzner self-host) when ANY is true:
- It gets a real paying customer / real production traffic.
- It needs an isolated user base (separate auth + branding).
- Its data approaches a large share of the 500 MB, or it needs more compute.
- It needs backups / point-in-time recovery independent of the others.

Graduating is clean because each app is a single schema:
1. Create the new project (or Hetzner stack).
2. `pg_dump --schema=<app>` (structure + data), restore into the new project.
3. Point that app's client/env at the new project and expose its schema there.
4. In this project: drop the `<app>` schema, delete its row from
   `public.rls_managed_schemas`, and remove it from `pgrst.db_schemas`.
