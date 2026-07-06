"use client";

import { useState } from "react";
import { useMetrics } from "@/features/metrics/hooks/useMetrics";
import {
 formatDayShort,
 METRIC_PERIOD_LABELS,
 type MetricPeriod,
 type RankRow,
} from "@/features/metrics/domain/types";
import { formatPrice } from "@/features/products/domain/types";

const PERIODS: MetricPeriod[] = ["7d", "30d", "all"];

function Card({ label, value }: { label: string; value: string }) {
 return (
 <div className="flex-1 rounded-xl border border-line bg-surface p-4">
 <p className="text-xs uppercase text-muted">{label}</p>
 <p className="text-2xl font-bold tabular-nums">{value}</p>
 </div>
 );
}

function RevenueChart({
 data,
}: {
 data: { day: string; revenue: number }[];
}) {
 const max = Math.max(1, ...data.map((d) => d.revenue));
 return (
 <div className="rounded-xl border border-line bg-surface p-4">
 <p className="mb-3 text-sm font-semibold text-muted dark:text-muted">
 Ingresos por día
 </p>
 <div className="flex h-40 items-end gap-1 overflow-x-auto">
 {data.map((d) => (
 <div
 key={d.day}
 className="flex min-w-[8px] flex-1 flex-col items-center justify-end"
 title={`${formatDayShort(d.day)}: ${formatPrice(d.revenue)}`}
 >
 <div
 className="w-full rounded-t bg-blue-500"
 style={{
 height: `${(d.revenue / max) * 100}%`,
 minHeight: d.revenue > 0 ? "2px" : "0",
 }}
 />
 </div>
 ))}
 </div>
 {data.length > 0 && (
 <div className="mt-1 flex justify-between text-xs text-muted">
 <span>{formatDayShort(data[0].day)}</span>
 <span>{formatDayShort(data[data.length - 1].day)}</span>
 </div>
 )}
 </div>
 );
}

function RankList({
 title,
 rows,
 showQuantity,
}: {
 title: string;
 rows: RankRow[];
 showQuantity?: boolean;
}) {
 const max = Math.max(1, ...rows.map((r) => r.revenue));
 return (
 <div className="rounded-xl border border-line bg-surface p-4">
 <p className="mb-3 text-sm font-semibold text-muted dark:text-muted">
 {title}
 </p>
 {rows.length === 0 ? (
 <p className="text-sm text-muted">Sin datos.</p>
 ) : (
 <ul className="flex flex-col gap-2">
 {rows.map((r) => (
 <li key={r.label} className="text-sm">
 <div className="flex items-baseline justify-between gap-2">
 <span className="truncate">{r.label}</span>
 <span className="shrink-0 tabular-nums font-medium">
 {formatPrice(r.revenue)}
 </span>
 </div>
 <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
 <div
 className="h-full rounded-full bg-blue-500"
 style={{ width: `${(r.revenue / max) * 100}%` }}
 />
 </div>
 <p className="mt-0.5 text-xs text-muted">
 {showQuantity
 ? `${r.quantity} unidades`
 : `${r.count} ${r.count === 1 ? "venta" : "ventas"}`}
 </p>
 </li>
 ))}
 </ul>
 )}
 </div>
 );
}

export default function MetricsView() {
 const [period, setPeriod] = useState<MetricPeriod>("7d");
 const m = useMetrics(period);

 return (
 <div className="flex flex-col gap-4">
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
 {METRIC_PERIOD_LABELS[p]}
 </button>
 ))}
 </div>

 {m.error && (
 <p className="text-sm text-red-600" role="alert">
 {m.error}
 </p>
 )}

 {m.loading ? (
 <p className="text-sm text-muted">Calculando métricas…</p>
 ) : (
 <>
 <div className="flex flex-col gap-3 sm:flex-row">
 <Card label="Ingresos" value={formatPrice(m.totalRevenue)} />
 <Card label="Ventas" value={String(m.salesCount)} />
 <Card label="Ticket promedio" value={formatPrice(m.avgTicket)} />
 </div>

 <RevenueChart data={m.byDay} />

 <RankList
 title="Productos más vendidos"
 rows={m.topProducts}
 showQuantity
 />

 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 <RankList title="Ventas por vendedor" rows={m.bySeller} />
 <RankList title="Entregas por repartidor" rows={m.byDriver} />
 </div>
 </>
 )}
 </div>
 );
}
