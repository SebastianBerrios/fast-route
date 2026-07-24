"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  rowToProduct,
  type Product,
  type ProductInput,
  type StockReason,
} from "@/features/products/domain/types";
import {
  insertProduct,
  toProductRow,
} from "@/features/products/services/products";

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

// Realtime topics must be unique per subscription: the browser client is a
// singleton and `supabase.channel(name)` returns an existing channel for a
// reused topic. Calling `.on("postgres_changes", …)` on an already-subscribed
// channel throws — StrictMode's double-mounted effects hit this because the
// async `removeChannel` from the first run hasn't finished when the second
// run reuses the topic.
let channelSeq = 0;

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
      .channel(`products-realtime-${++channelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "fast_route", table: "products" },
        () => fetchProducts(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchProducts]);

  const createProduct = useCallback(
    async (input: ProductInput) => {
      const { id, error: errorMessage } = await insertProduct(
        supabase,
        userId,
        input,
      );
      // Refresh first: a fetch success clears the error state, and a partial
      // failure (product created, ledger insert failed) must survive it.
      if (id) await fetchProducts();
      if (errorMessage) {
        setError(errorMessage);
        // The product exists on partial failure: report success so the form
        // closes instead of re-submitting a duplicate.
        return Boolean(id);
      }
      return true;
    },
    [supabase, userId, fetchProducts],
  );

  const updateProduct = useCallback(
    async (id: string, input: ProductInput) => {
      const { error } = await supabase
        .from("products")
        .update(toProductRow(input))
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
