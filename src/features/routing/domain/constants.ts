import type { Coordinate } from "@/features/routing/domain/types";

/**
 * Fallback map center used when a tenant has no stored location yet.
 * Tacna, Perú — the region the app launched in.
 */
export const DEFAULT_MAP_CENTER: Coordinate = { lng: -70.2463, lat: -18.0066 };
