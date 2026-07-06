"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  rowToProduct,
  type Product,
  type ProductInput,
  type StockReason,
} from "@/features/products/domain/types";

export interface UseProducts {
  products: Product[];
  loading: boolean;
  error: string | null;
  createProduct: (input: ProductInput) => Promise<boolean>;
  updateProduct: (id: string, input: ProductInput) => Promise<boolean>;
  removeProduct: (id: string) => Promise<boolean>;
  adjustStock: (
    productId: string,
    delta: number,
    reason: StockReason,
    note?: string,
  ) => Promise<boolean>;
}

/**
 * Maps the camelCase form input to the snake_case table columns.
 * Note: `stock` is intentionally excluded — it changes only via the
 * stock movements ledger, never by editing the product directly.
 */
function toRow(input: ProductInput) {
  return {
    name: input.name,
    unit: input.unit ?? null,
    price: input.price,
    is_active: input.isActive ?? true,
    min_stock: input.minStock ?? 0,
  };
}

export function useProducts(userId: string): UseProducts {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (error) setError(error.message);
    else {
      setProducts((data ?? []).map(rowToProduct));
      setError(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProducts();

    const channel = supabase
      .channel("products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => fetchProducts(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchProducts]);

  const createProduct = useCallback(
    async (input: ProductInput) => {
      const { data, error } = await supabase
        .from("products")
        .insert({ created_by: userId, ...toRow(input) })
        .select("id")
        .single();
      if (error) {
        setError(error.message);
        return false;
      }
      // Record the starting stock as an initial movement (keeps the ledger honest).
      if (input.initialStock && input.initialStock !== 0) {
        await supabase.from("stock_movements").insert({
          product_id: data.id,
          delta: input.initialStock,
          reason: "purchase",
          created_by: userId,
          note: "Stock inicial",
        });
      }
      await fetchProducts();
      return true;
    },
    [supabase, userId, fetchProducts],
  );

  const updateProduct = useCallback(
    async (id: string, input: ProductInput) => {
      const { error } = await supabase
        .from("products")
        .update(toRow(input))
        .eq("id", id);
      if (error) {
        setError(error.message);
        return false;
      }
      await fetchProducts();
      return true;
    },
    [supabase, fetchProducts],
  );

  const removeProduct = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        setError(error.message);
        return false;
      }
      await fetchProducts();
      return true;
    },
    [supabase, fetchProducts],
  );

  const adjustStock = useCallback(
    async (
      productId: string,
      delta: number,
      reason: StockReason,
      note?: string,
    ) => {
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        delta,
        reason,
        created_by: userId,
        note: note?.trim() || null,
      });
      if (error) {
        setError(error.message);
        return false;
      }
      await fetchProducts();
      return true;
    },
    [supabase, userId, fetchProducts],
  );

  return {
    products,
    loading,
    error,
    createProduct,
    updateProduct,
    removeProduct,
    adjustStock,
  };
}
