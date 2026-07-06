"use client";

import { useState } from "react";
import { useSales } from "@/features/sales/hooks/useSales";
import {
 formatDateTime,
 PERIOD_LABELS,
 type SalePeriod,
} from "@/features/sales/domain/types";
import { formatPrice } from "@/features/products/domain/types";

const PERIODS: SalePeriod[] = ["today", "7d", "all"];

export default function SalesView() {
 const [period, setPeriod] = useState<SalePeriod>("today");
 const { sales, loading, error, total, count } = useSales(period);

 return (
 <div className="flex flex-col gap-4">
 {/* Period selector */}
 <div className="flex gap-2">
 {PERIODS.map((p) => (
 <button
 key={p}
 type="button"
 onClick={() => setPeriod(p)}
 className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
 period === p
 ? "border-brand bg-brand text-white"
 : "border-line hover:bg-black/5 dark:hover:bg-white/10"
 }`}
 >
 {PERIOD_LABELS[p]}
 </button>
 ))}
 </div>

 {/* Summary */}
 <div className="flex gap-6 rounded-xl border border-line bg-surface p-4">
 <div>
 <p className="text-xs uppercase text-muted">Ventas</p>
 <p className="text-2xl font-bold">{count}</p>
 </div>
 <div>
 <p className="text-xs uppercase text-muted">Ingresos</p>
 <p className="text-2xl font-bold tabular-nums">{formatPrice(total)}</p>
 </div>
 </div>

 {error && (
 <p className="text-sm text-red-600" role="alert">
 {error}
 </p>
 )}

 {/* List */}
 <section className="rounded-xl border border-line ">
 {loading ? (
 <p className="p-4 text-sm text-muted">Cargando ventas…</p>
 ) : sales.length === 0 ? (
 <p className="p-4 text-sm text-muted">
 No hay ventas en este período.
 </p>
 ) : (
 <ul className="divide-y divide-line ">
 {sales.map((sale) => (
 <li key={sale.id} className="flex items-start gap-3 p-3 text-sm">
 <div className="min-w-0 flex-1">
 <p className="font-medium">
 {sale.customerName || "Cliente sin nombre"}
 </p>
 <p className="text-xs text-muted">
 {formatDateTime(sale.deliveredAt)}
 </p>
 {sale.items.length > 0 && (
 <p className="mt-1 truncate text-xs text-muted">
 {sale.items
 .map((i) => `${i.quantity}× ${i.productName}`)
 .join(", ")}
 </p>
 )}
 </div>
 <span className="shrink-0 font-semibold tabular-nums">
 {formatPrice(sale.total)}
 </span>
 </li>
 ))}
 </ul>
 )}
 </section>
 </div>
 );
}
