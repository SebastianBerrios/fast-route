"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rowToOrder, type Order } from "@/features/orders/domain/types";
import { periodSince, type SalePeriod } from "@/features/sales/domain/types";

export interface UseSales {
  sales: Order[];
  loading: boolean;
  error: string | null;
  total: number;
  count: number;
}

/** Loads delivered orders (= sales) for a period, refreshed in real time. */
export function useSales(period: SalePeriod): UseSales {
  const [supabase] = useState(() => createClient());
  const [sales, setSales] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    let query = supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("status", "delivered")
      .order("delivered_at", { ascending: false });

    const since = periodSince(period);
    if (since) query = query.gte("delivered_at", since);

    const { data, error } = await query;
    if (error) setError(error.message);
    else {
      setSales((data ?? []).map(rowToOrder));
      setError(null);
    }
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => {
    fetchSales();
    const channel = supabase
      .channel("sales-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchSales(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchSales]);

  const total = useMemo(
    () => sales.reduce((sum, o) => sum + o.total, 0),
    [sales],
  );

  return { sales, loading, error, total, count: sales.length };
}
