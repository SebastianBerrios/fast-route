import type { Database } from "@/lib/supabase/database.types";

export type StockReason = Database["public"]["Enums"]["stock_reason"];

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  purchase: "Compra / reposición",
  sale: "Venta",
  adjustment: "Ajuste",
};

/** A product in the catalog (e.g. water bottle, ice bag). */
export interface Product {
  id: string;
  createdBy: string;
  name: string;
  unit: string | null;
  price: number;
  isActive: boolean;
  /** Current quantity on hand (maintained by the stock movements ledger). */
  stock: number;
  /** Low-stock threshold; 0 disables the alert. */
  minStock: number;
  /**
   * When set, this product sells from another product's stock pool
   * (e.g. a refill sells the same physical item as the full bottle).
   */
  stockSourceId: string | null;
  createdAt: string;
}

/** Editable product fields. Stock itself changes only via movements. */
export interface ProductInput {
  name: string;
  unit?: string | null;
  price: number;
  isActive?: boolean;
  minStock?: number;
  /** Optional starting stock — recorded as an initial movement on create. */
  initialStock?: number;
  /** Deduct stock from this product's pool instead of an own pool. */
  stockSourceId?: string | null;
}

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    createdBy: row.created_by,
    name: row.name,
    unit: row.unit,
    price: Number(row.price),
    isActive: row.is_active,
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    stockSourceId: row.stock_source_id,
    createdAt: row.created_at,
  };
}

/** Format a price in Peruvian soles. */
export function formatPrice(price: number): string {
  return `S/ ${price.toFixed(2)}`;
}

/** True when a product is at or below its low-stock threshold. */
export function isLowStock(product: Product): boolean {
  return product.minStock > 0 && product.stock <= product.minStock;
}
