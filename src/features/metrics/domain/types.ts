export type MetricPeriod = "7d" | "30d" | "all";

export const METRIC_PERIOD_LABELS: Record<MetricPeriod, string> = {
  "7d": "7 días",
  "30d": "30 días",
  all: "Todo",
};

/** ISO lower bound for a period, or null for "all". Uses the local clock. */
export function metricSince(period: MetricPeriod): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.toISOString();
}

/** Local calendar day key (YYYY-MM-DD) for a timestamp. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Short label for a day key, e.g. "12/07". */
export function formatDayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
  });
}

export interface DayBucket {
  day: string;
  revenue: number;
  count: number;
}

export interface RankRow {
  label: string;
  quantity: number;
  revenue: number;
  count: number;
}
