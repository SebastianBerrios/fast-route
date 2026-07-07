import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Coordinate } from "@/features/routing/domain/types";

export interface TenantLocation {
  /** Stored business center, or null if the tenant never set one. */
  center: Coordinate | null;
  /** ISO 3166-1 country code (alpha-3, e.g. "PER"), or null. */
  country: string | null;
}

/**
 * The current tenant's stored location. RLS scopes the query to the caller's
 * own tenant, so no explicit tenant_id filter is needed. Returns nulls when the
 * user is signed out or the tenant has no location yet.
 */
export async function getTenantLocation(): Promise<TenantLocation> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("center_lng, center_lat, country")
    .maybeSingle();

  if (!data || data.center_lng == null || data.center_lat == null) {
    return { center: null, country: data?.country ?? null };
  }
  return {
    center: { lng: data.center_lng, lat: data.center_lat },
    country: data.country ?? null,
  };
}
