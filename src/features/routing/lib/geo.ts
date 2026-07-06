import polyline from "@mapbox/polyline";
import type { Coordinate } from "@/features/routing/domain/types";

/**
 * Decode an encoded polyline (Google/VROOM precision 5) into coordinates.
 * @mapbox/polyline returns [lat, lng] pairs; we normalize to { lng, lat }.
 */
export function decodePolyline(encoded: string): Coordinate[] {
  return polyline.decode(encoded).map(([lat, lng]) => ({ lat, lng }));
}

/** Format seconds as a compact human duration, e.g. "1 h 24 min" or "8 min". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** Format meters as km with one decimal, or meters when under 1 km. */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
