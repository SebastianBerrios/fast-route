/** Time window for filtering the sales history. */
export type SalePeriod = "today" | "7d" | "all";

export const PERIOD_LABELS: Record<SalePeriod, string> = {
  today: "Hoy",
  "7d": "Últimos 7 días",
  all: "Todo",
};

/**
 * Returns the ISO lower bound for a period, or null for "all".
 * Uses the browser's local clock (runs client-side).
 */
export function periodSince(period: SalePeriod): string | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/** Format a delivery timestamp for display (Peru locale). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
