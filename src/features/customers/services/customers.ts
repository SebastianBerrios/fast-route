import type { createClient } from "@/lib/supabase/client";
import type { CustomerInput } from "@/features/customers/domain/types";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Inserts a customer. Plain async function (no hook, no realtime) so
 * lightweight consumers like the onboarding wizard can create a customer
 * without subscribing to the customers table.
 *
 * Returns a structured result mirroring `insertProduct`: `error` is `null`
 * on success or the failure message otherwise.
 */
export async function insertCustomer(
  supabase: SupabaseClient,
  userId: string,
  input: CustomerInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("customers")
    .insert({ created_by: userId, ...input });
  return { error: error ? error.message : null };
}
