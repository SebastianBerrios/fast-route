import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/** Supabase client for use in Client Components (runs in the browser). */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  // This app lives in its own `fast_route` schema, not `public`.
  return createBrowserClient<Database, "fast_route">(url, anonKey, {
    db: { schema: "fast_route" },
  });
}
