import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServiceRoleEnv } from "@/lib/supabase/env";

/**
 * A Supabase client holding the service_role key. It BYPASSES Row Level
 * Security and can reach the Auth admin API, so every caller must enforce
 * authorization itself before touching it — RLS is not there to catch mistakes.
 *
 * It exists for the one operation the anon-key client cannot perform: creating
 * the `auth.users` row for a team member the admin is adding. Marked
 * "server-only" so importing it from a client component fails at build time.
 *
 * No session is persisted: this client represents the app, never a user.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getServiceRoleEnv();
  return createSupabaseClient<Database, "fast_route">(url, serviceRoleKey, {
    db: { schema: "fast_route" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
