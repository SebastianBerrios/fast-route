"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lineTotal, rowToOrder, type Order } from "@/features/orders/domain/types";
import {
  dayKey,
  metricSince,
  type DayBucket,
  type MetricPeriod,
  type RankRow,
} from "@/features/metrics/domain/types";

export interface Metrics {
  loading: boolean;
  error: string | null;
  totalRevenue: number;
  salesCount: number;
  avgTicket: number;
  byDay: DayBucket[];
  topProducts: RankRow[];
  bySeller: RankRow[];
  byDriver: RankRow[];
}

function rankByPerson(
  sales: Order[],
  pick: (o: Order) => string | null,
  names: Map<string, string>,
): RankRow[] {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const o of sales) {
    const id = pick(o);
    const label = id ? (names.get(id) ?? "—") : "Sin asignar";
    const cur = map.get(label) ?? { revenue: 0, count: 0 };
    cur.revenue += o.total;
    cur.count += 1;
    map.set(label, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, quantity: 0, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildByDay(sales: Order[], period: MetricPeriod): DayBucket[] {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const o of sales) {
    if (!o.deliveredAt) continue;
    const k = dayKey(o.deliveredAt);
    const cur = map.get(k) ?? { revenue: 0, count: 0 };
    cur.revenue += o.total;
    cur.count += 1;
    map.set(k, cur);
  }

  if (period === "all") {
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, v]) => ({ day, ...v }));
  }

  // Fill the full range so the chart shows empty days too.
  const days = period === "7d" ? 7 : 30;
  const out: DayBucket[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    const v = map.get(k) ?? { revenue: 0, count: 0 };
    out.push({ day: k, ...v });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function useMetrics(period: MetricPeriod): Metrics {
  const [supabase] = useState(() => createClient());
  const [sales, setSales] = useState<Order[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    let query = supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("status", "delivered");
    const since = metricSince(period);
    if (since) query = query.gte("delivered_at", since);

    const [ordersRes, profilesRes] = await Promise.all([
      query,
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    if (ordersRes.error) {
      setError(ordersRes.error.message);
    } else {
      setSales((ordersRes.data ?? []).map(rowToOrder));
      const map = new Map<string, string>();
      for (const p of profilesRes.data ?? []) {
        map.set(p.id, p.full_name || p.email || "—");
      }
      setNames(map);
      setError(null);
    }
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("metrics-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchData]);

  return useMemo(() => {
    const totalRevenue = sales.reduce((s, o) => s + o.total, 0);
    const salesCount = sales.length;

    const productMap = new Map<string, { quantity: number; revenue: number }>();
    for (const o of sales) {
      for (const item of o.items) {
        const cur = productMap.get(item.productName) ?? {
          quantity: 0,
          revenue: 0,
        };
        cur.quantity += item.quantity;
        cur.revenue += lineTotal(item);
        productMap.set(item.productName, cur);
      }
    }
    const topProducts: RankRow[] = [...productMap.entries()]
      .map(([label, v]) => ({ label, count: 0, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return {
      loading,
      error,
      totalRevenue,
      salesCount,
      avgTicket: salesCount > 0 ? totalRevenue / salesCount : 0,
      byDay: buildByDay(sales, period),
      topProducts,
      bySeller: rankByPerson(sales, (o) => o.createdBy, names),
      byDriver: rankByPerson(sales, (o) => o.deliveredBy, names),
    };
  }, [sales, names, loading, error, period]);
}
