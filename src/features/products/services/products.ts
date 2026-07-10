import type { createClient } from "@/lib/supabase/client";
import type { ProductInput } from "@/features/products/domain/types";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Maps the camelCase form input to the snake_case table columns.
 * Note: `stock` is intentionally excluded — it changes only via the
 * stock movements ledger, never by editing the product directly.
 */
export function toProductRow(input: ProductInput) {
  return {
    name: input.name,
    unit: input.unit ?? null,
    price: input.price,
    is_active: input.isActive ?? true,
    min_stock: input.minStock ?? 0,
    // Distinguish "not provided" from an explicit unlink: omitting the key
    // leaves the link untouched on partial updates, while an explicit null
    // unlinks. Mapping undefined to null here would silently unlink.
    ...(input.stockSourceId !== undefined
      ? { stock_source_id: input.stockSourceId }
      : {}),
  };
}

/**
 * Inserts a product and, when an initial stock is given, records it as the
 * first movement in the ledger. Plain async function (no hook, no realtime)
 * so lightweight consumers like the onboarding wizard can create a product
 * without subscribing to the products table.
 *
 * Returns the created product id on success, or the error message on failure.
 */
export async function insertProduct(
  supabase: SupabaseClient,
  userId: string,
  input: ProductInput,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("products")
    .insert({ created_by: userId, ...toProductRow(input) })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };

  // Record the starting stock as an initial movement (keeps the ledger honest).
  if (input.initialStock && input.initialStock !== 0) {
    const { error: ledgerError } = await supabase
      .from("stock_movements")
      .insert({
        product_id: data.id,
        delta: input.initialStock,
        reason: "purchase",
        created_by: userId,
        note: "Stock inicial",
      });
    if (ledgerError) {
      // Partial failure: the product exists but its starting stock was not
      // recorded. Return both so the UI can keep the product and warn.
      return {
        id: data.id,
        error:
          "Producto creado, pero no se pudo registrar el stock inicial. Ajustalo manualmente.",
      };
    }
  }
  return { id: data.id, error: null };
}
