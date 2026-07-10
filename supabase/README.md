# Supabase backend

The database schema, RLS policies, triggers, and functions for fast-route.

## Provenance

The remote project (ref `vzxrsvqnxkoiuwvdozxv`) was migration-tracked all along —
its `supabase_migrations.schema_migrations` history holds 26 named migrations —
but those migration **files had never been committed to this repo**. On
2026-07-10 the files under `migrations/` were reconstructed verbatim from that
remote history, so the repo now matches the database's real migration history
version-for-version (names and timestamps included).

The two most recent migrations were authored during the app review:

- `..._stock_deduction_idempotent.sql` — makes delivery-time stock deduction
  idempotent (re-delivering an order no longer double-deducts).
- `..._create_order_with_items_rpc.sql` — `public.create_order_with_items(...)`,
  an atomic order+items insert (replaces the client's two-step insert).

Both are already applied to the remote. `src/lib/supabase/database.types.ts` was
regenerated afterwards.

## What lives in the database (not just the client)

Most business rules are enforced here, not in the React app:

- **Signup / tenancy** — `private.handle_new_user()` on `auth.users` creates the
  tenant + profile (or joins via a valid, unexpired invite) and seeds role
  permissions via `private.default_permissions()`.
- **Stock** — delivering an order (`orders.status -> 'delivered'`) fires
  `private.deduct_stock_on_delivery()`, which writes a `sale` movement against the
  product's pool (`coalesce(stock_source_id, id)`); `private.apply_stock_movement()`
  then applies the delta to `products.stock`. Stock is allowed to go negative
  (backorder) — the UI surfaces it, the DB does not block it.
- **Stock pool integrity** — `private.check_stock_source()` blocks self-links,
  cross-tenant links, and chains (row-locked); `private.prevent_stock_pool_owner_deletion()`
  blocks deleting a product other products draw stock from.
- **Roles** — `private.guard_role_change()` requires `users.manage` to change a
  role; `private.sync_role_to_app_metadata()` mirrors role/permissions/tenant into
  the JWT `app_metadata` (takes effect on the user's next token refresh — see
  `src/features/shell/SessionSync.tsx`).

## Local development (requires Docker)

```bash
supabase init          # if you don't already have the full config template
supabase link --project-ref vzxrsvqnxkoiuwvdozxv
supabase migration list   # local files should line up with the remote history
supabase db reset      # rebuilds a local DB from these migrations
```

If `migration list` shows the remote entries as applied but local as missing
(or vice-versa) after linking, reconcile with `supabase migration repair` before
pushing anything new. Docker is required for `supabase db reset` / `supabase start`.
