import type { Coordinate } from "@/features/routing/domain/types";

/**
 * External navigation deep links. Origin is intentionally omitted so the maps
 * app uses the device's live GPS as the starting point.
 */

// Google Maps URL API: device (origin) + up to 9 waypoints + 1 destination.
export const MAX_ROUTE_STOPS = 10;

const gmap = (lat: number, lng: number) => `${lat},${lng}`;

/** Full multi-stop route in Google Maps, preserving the given order. */
export function googleMapsRouteUrl(stops: Coordinate[]): string {
  const pts = stops.slice(0, MAX_ROUTE_STOPS);
  if (pts.length === 0) return "";
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(0, -1);

  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "driving");
  params.set("destination", gmap(destination.lat, destination.lng));
  if (waypoints.length > 0) {
    params.set(
      "waypoints",
      waypoints.map((w) => gmap(w.lat, w.lng)).join("|"),
    );
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Navigate to a single point in Google Maps. */
export function googleMapsPointUrl(c: Coordinate): string {
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${gmap(
    c.lat,
    c.lng,
  )}`;
}

/** Navigate to a single point in Waze (Waze has no multi-stop URL support). */
export function wazePointUrl(c: Coordinate): string {
  return `https://waze.com/ul?ll=${c.lat}%2C${c.lng}&navigate=yes`;
}
