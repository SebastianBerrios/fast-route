-- Local-only setup. Seeds run on `supabase db reset`/`start` and are NEVER
-- pushed to the remote (only files in supabase/migrations are), which is
-- exactly why pgTAP is enabled here instead of in a migration: the test
-- harness has no business existing in production.
create extension if not exists pgtap with schema extensions;
