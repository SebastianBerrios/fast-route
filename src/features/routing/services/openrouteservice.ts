import "server-only";
import type {
  Coordinate,
  OptimizeInput,
  OptimizedRoute,
  RouteStep,
  RouteStepType,
} from "@/features/routing/domain/types";
import { decodePolyline } from "@/features/routing/lib/geo";

const ORS_OPTIMIZATION_URL = "https://api.openrouteservice.org/optimization";
const PHOTON_GEOCODE_URL = "https://photon.komoot.io/api/";
const ORS_AUTOCOMPLETE_URL =
  "https://api.openrouteservice.org/geocode/autocomplete";
const ORS_DIRECTIONS_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car";

/** Shape of the VROOM/ORS optimization response we rely on. */
interface OrsStep {
  type: RouteStepType | string;
  /** Present only for job steps; matches the integer id we send. */
  id?: number;
  location: [number, number];
  arrival: number;
}

interface OrsRoute {
  steps: OrsStep[];
  duration: number;
  distance?: number;
  geometry?: string;
}

interface OrsResponse {
  routes?: OrsRoute[];
  summary?: { duration: number; distance: number };
  error?: unknown;
}

export class OpenRouteServiceError extends Error {}

const toLngLat = (c: Coordinate): [number, number] => [c.lng, c.lat];
const fromLngLat = ([lng, lat]: [number, number]): Coordinate => ({ lng, lat });

/**
 * Optimize the visiting order of stops for a single vehicle using
 * OpenRouteService's optimization endpoint (VROOM under the hood).
 *
 * VROOM requires integer job ids, so we map each stop to its 1-based index
 * and translate the result back to our string stop ids.
 */
export async function optimizeRoute(
  input: OptimizeInput,
): Promise<OptimizedRoute> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new OpenRouteServiceError(
      "Missing ORS_API_KEY. Get a free key at https://openrouteservice.org/dev and add it to .env.local.",
    );
  }

  const { vehicle, stops } = input;
  if (stops.length === 0) {
    throw new OpenRouteServiceError("At least one stop is required.");
  }

  // Map 1-based integer id -> our stop id, so we can decode the response.
  const idByIndex = new Map<number, string>();
  const jobs = stops.map((stop, i) => {
    const jobId = i + 1;
    idByIndex.set(jobId, stop.id);
    return { id: jobId, location: toLngLat(stop.coordinate) };
  });

  const body = {
    jobs,
    vehicles: [
      {
        id: 1,
        profile: "driving-car",
        start: toLngLat(vehicle.start),
        ...(vehicle.end ? { end: toLngLat(vehicle.end) } : {}),
      },
    ],
    // g: true -> return route geometry (encoded polyline) and distances.
    options: { g: true },
  };

  const res = await fetch(ORS_OPTIMIZATION_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenRouteServiceError(
      `OpenRouteService returned ${res.status}. ${detail.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as OrsResponse;
  const route = data.routes?.[0];
  if (!route) {
    throw new OpenRouteServiceError("No route found for the given stops.");
  }

  const steps: RouteStep[] = route.steps.map((s) => ({
    type: (s.type as RouteStepType) ?? "job",
    stopId: s.id != null ? idByIndex.get(s.id) : undefined,
    coordinate: fromLngLat(s.location),
    arrivalSeconds: s.arrival,
  }));

  const order = steps
    .filter((s) => s.type === "job" && s.stopId)
    .map((s) => s.stopId as string);

  const geometry = route.geometry ? decodePolyline(route.geometry) : [];

  return {
    order,
    steps,
    geometry,
    durationSeconds: data.summary?.duration ?? route.duration ?? 0,
    distanceMeters: data.summary?.distance ?? route.distance ?? 0,
  };
}

export interface GeocodeResult {
  label: string;
  lng: number;
  lat: number;
  /** ISO 3166-1 alpha-2 country code (e.g. "PE"), when the provider returns it. */
  country?: string;
}

/** Optional spatial constraints to keep results near the business's region. */
export interface GeocodeOptions {
  /** Proximity bias: results near this point rank higher (never excluded). */
  focus?: { lng: number; lat: number };
}

interface PhotonResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: {
      name?: string;
      housenumber?: string;
      street?: string;
      city?: string;
      district?: string;
      state?: string;
      country?: string;
      countrycode?: string;
    };
  }>;
}

/**
 * Forward-geocode a free-text address to candidate coordinates using Photon
 * (photon.komoot.io), an OpenStreetMap-based geocoder. Returns the top matches,
 * best first.
 *
 * We use Photon here rather than OpenRouteService/Pelias because ORS's data
 * build does not expose house numbers across much of Peru, while Photon (raw
 * OSM) does. `opts.focus` (usually the current map center) biases results toward
 * the business's region so an ambiguous street name resolves locally. Photon has
 * no country hard-filter; the proximity bias plays that role.
 */
export async function geocodeAddress(
  text: string,
  opts: GeocodeOptions = {},
): Promise<GeocodeResult[]> {
  const url = new URL(PHOTON_GEOCODE_URL);
  url.searchParams.set("q", text);
  url.searchParams.set("limit", "5");
  if (opts.focus) {
    url.searchParams.set("lon", String(opts.focus.lng));
    url.searchParams.set("lat", String(opts.focus.lat));
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenRouteServiceError(
      `Geocoding failed (${res.status}). ${detail.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as PhotonResponse;
  return (data.features ?? [])
    .filter((f) => f.geometry?.coordinates)
    .map((f) => {
      const p = f.properties ?? {};
      // Photon returns address parts separately (no ready-made label). Build a
      // readable one: "Street 159, City, State, Country".
      const street =
        p.housenumber && p.street ? `${p.street} ${p.housenumber}` : p.street;
      const primary = street || p.name || "";
      const parts = [primary, p.city ?? p.district, p.state, p.country].filter(
        Boolean,
      ) as string[];
      // Drop consecutive duplicates (e.g. city and state both "Tacna").
      const label =
        parts.filter((v, i) => v !== parts[i - 1]).join(", ") || text;
      return {
        label,
        lng: f.geometry!.coordinates![0],
        lat: f.geometry!.coordinates![1],
        country: p.countrycode?.toUpperCase() ?? undefined,
      };
    });
}

export interface CitySuggestion {
  /**
   * Stable unique id (Pelias `gid`). Pelias can return distinct records with
   * identical label + coordinates, so the label is not a safe identity —
   * this id is what React keys and dedupe must use.
   */
  id: string;
  /** Full display label, e.g. "Tacna, Tacna, Peru". */
  label: string;
  /** City name alone, e.g. "Tacna". */
  city: string;
  /** ISO 3166-1 alpha-3 country code (e.g. "PER"), when the provider returns it. */
  country?: string;
  lng: number;
  lat: number;
}

interface OrsAutocompleteResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: {
      gid?: string;
      name?: string;
      label?: string;
      country_a?: string;
    };
  }>;
}

/**
 * Suggest cities worldwide matching a partial name, using OpenRouteService's
 * (Pelias) autocomplete endpoint restricted to city-like layers.
 *
 * `localadmin` and `borough` are included alongside `locality` because in
 * several countries (e.g. Peru's districts) the practical "city" a user types
 * is indexed under those layers and `locality` alone returns thin results.
 */
export async function autocompleteCities(
  text: string,
): Promise<CitySuggestion[]> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new OpenRouteServiceError("Missing ORS_API_KEY.");
  }

  const url = new URL(ORS_AUTOCOMPLETE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", text);
  url.searchParams.set("layers", "locality,localadmin,borough");
  url.searchParams.set("size", "5");

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenRouteServiceError(
      `City autocomplete failed (${res.status}). ${detail.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as OrsAutocompleteResponse;
  const suggestions = (data.features ?? [])
    .filter((f) => f.geometry?.coordinates && f.properties?.name)
    .map((f, index) => {
      const label = f.properties?.label ?? f.properties!.name!;
      const lng = f.geometry!.coordinates![0];
      const lat = f.geometry!.coordinates![1];
      return {
        // Index fallback keeps ids unique even if Pelias omits the gid.
        id: f.properties?.gid ?? `${label}-${lng}-${lat}-${index}`,
        label,
        city: f.properties!.name!,
        country: f.properties?.country_a ?? undefined,
        lng,
        lat,
      };
    });

  // Pelias occasionally returns the same record twice; keep the first.
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

interface OrsDirectionsResponse {
  routes?: Array<{
    geometry?: string;
    summary?: { duration?: number; distance?: number };
  }>;
}

interface DirectionsLeg {
  geometry: Coordinate[];
  durationSeconds: number;
  distanceMeters: number;
}

/** Road-following directions between an ordered list of coordinates. */
export async function getDirections(
  coordinates: Coordinate[],
): Promise<DirectionsLeg> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new OpenRouteServiceError("Missing ORS_API_KEY.");

  const res = await fetch(ORS_DIRECTIONS_URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: coordinates.map(toLngLat) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenRouteServiceError(
      `Directions failed (${res.status}). ${detail.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as OrsDirectionsResponse;
  const route = data.routes?.[0];
  if (!route?.geometry) {
    throw new OpenRouteServiceError("No directions found.");
  }
  return {
    geometry: decodePolyline(route.geometry),
    durationSeconds: route.summary?.duration ?? 0,
    distanceMeters: route.summary?.distance ?? 0,
  };
}

/**
 * Route with a locked first stop: the driver heads to `locked` (road-following
 * directions), then the remaining stops are optimized starting from there.
 */
export async function optimizeLockedRoute(
  input: OptimizeInput & { locked: { id: string; coordinate: Coordinate } },
): Promise<OptimizedRoute> {
  const { vehicle, stops, locked } = input;

  const leg1 = await getDirections([vehicle.start, locked.coordinate]);

  if (stops.length === 0) {
    return {
      order: [locked.id],
      steps: [],
      geometry: leg1.geometry,
      durationSeconds: leg1.durationSeconds,
      distanceMeters: leg1.distanceMeters,
    };
  }

  const leg2 = await optimizeRoute({
    vehicle: {
      id: vehicle.id,
      start: locked.coordinate,
      ...(vehicle.end ? { end: vehicle.end } : {}),
    },
    stops,
  });

  return {
    order: [locked.id, ...leg2.order],
    steps: leg2.steps,
    geometry: [...leg1.geometry, ...leg2.geometry],
    durationSeconds: leg1.durationSeconds + leg2.durationSeconds,
    distanceMeters: leg1.distanceMeters + leg2.distanceMeters,
  };
}
