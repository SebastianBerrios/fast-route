import { NextResponse } from "next/server";
import {
  geocodeAddress,
  OpenRouteServiceError,
} from "@/features/routing/services/openrouteservice";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await geocodeAddress(query);
    return NextResponse.json({ results });
  } catch (err) {
    const message =
      err instanceof OpenRouteServiceError
        ? err.message
        : "Geocoding failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
