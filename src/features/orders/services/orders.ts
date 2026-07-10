import type { createClient } from "@/lib/supabase/client";
import type {
  NewOrderInput,
  NewOrderItemInput,
} from "@/features/orders/domain/types";

type SupabaseClient = ReturnType<typeof createClient>;

const INVALID_LOCATION = "Ubicación inválida para el pedido.";

/** Maps the camelCase order input to the snake_case orders columns. */
export function toOrderRow(userId: string, input: NewOrderInput) {
  return {
    created_by: userId,
    lng: input.lng,
    lat: input.lat,
    customer_name: input.customerName ?? null,
    note: input.note ?? null,
    customer_id: input.customerId ?? null,
    assigned_to: input.assignedTo ?? null,
  };
}

/** Inserts a bare order (no items). */
export async function insertOrder(
  supabase: SupabaseClient,
  userId: string,
  input: NewOrderInput,
): Promise<{ error: string | null }> {
  if (!Number.isFinite(input.lng) || !Number.isFinite(input.lat)) {
    return { error: INVALID_LOCATION };
  }
  const { error } = await supabase
    .from("orders")
    .insert(toOrderRow(userId, input));
  return { error: error?.message ?? null };
}

/**
 * Creates an order and its items atomically via the create_order_with_items
 * RPC: both commit in one transaction, or neither does (the old two-step
 * insert could orphan an order when the items insert failed). created_by is
 * set server-side from the session (auth.uid()), never trusted from the client.
 */
export async function insertOrderWithItems(
  supabase: SupabaseClient,
  input: NewOrderInput,
  items: Omit<NewOrderItemInput, "orderId">[],
): Promise<{ error: string | null }> {
  if (!Number.isFinite(input.lng) || !Number.isFinite(input.lat)) {
    return { error: INVALID_LOCATION };
  }
  const { error } = await supabase.rpc("create_order_with_items", {
    p_lng: input.lng,
    p_lat: input.lat,
    p_customer_name: input.customerName ?? undefined,
    p_note: input.note ?? undefined,
    p_customer_id: input.customerId ?? undefined,
    p_assigned_to: input.assignedTo ?? undefined,
    p_items: items.map((it) => ({
      product_id: it.productId,
      product_name: it.productName,
      quantity: it.quantity,
      unit_price: it.unitPrice,
    })),
  });
  return { error: error?.message ?? null };
}
