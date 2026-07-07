import { NextResponse } from "next/server";
import {
  geocodeAddress,
  OpenRouteServiceError,
} from "@/features/routing/services/openrouteservice";
import { getTenantLocation } from "@/features/tenants/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  // Proximity bias: the client sends its current map center. Fall back to the
  // tenant's stored center. Country is a hard filter from the tenant, so an
  // ambiguous street name can never resolve to another country.
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));
  const clientFocus =
    Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : undefined;

  const { center, country } = await getTenantLocation();

  try {
    const results = await geocodeAddress(query, {
      focus: clientFocus ?? center ?? undefined,
      country: country ?? undefined,
    });
    return NextResponse.json({ results });
  } catch (err) {
    const message =
      err instanceof OpenRouteServiceError
        ? err.message
        : "Geocoding failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
