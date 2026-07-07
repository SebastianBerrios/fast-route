import { NextResponse } from "next/server";
import {
  autocompleteCities,
  type CitySuggestion,
} from "@/features/routing/services/openrouteservice";

/**
 * Public city autocomplete for the signup form. Unlike /api/geocode this route
 * has no tenant scoping and must stay reachable without a session (it is
 * listed in the proxy's PUBLIC_PATHS). The ORS API key never leaves the server.
 *
 * Because the endpoint is anonymous and the ORS free-tier quota is shared by
 * every tenant, it is protected by a short-TTL response cache and a per-IP
 * rate limit. Both are module-level and in-memory: on Vercel Fluid Compute
 * that means per-instance and best-effort, which is acceptable here — they
 * only need to blunt quota abuse, not be globally consistent.
 */

/** Cached suggestion lists keyed by the normalized (trimmed, lowercased) query. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<
  string,
  { expiresAt: number; results: CitySuggestion[] }
>();

function getCachedResults(key: string): CitySuggestion[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function setCachedResults(key: string, results: CitySuggestion[]) {
  // Map preserves insertion order, so the first key is the oldest entry.
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
}

/** Sliding-window rate limit: at most N requests per IP per window. */
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_MAX_TRACKED_IPS = 1_000;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (requestLog.get(ip) ?? []).filter((t) => t > windowStart);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  // Re-insert so iteration order approximates least-recently-active.
  requestLog.delete(ip);
  requestLog.set(ip, recent);

  if (requestLog.size > RATE_LIMIT_MAX_TRACKED_IPS) {
    // Drop IPs whose entire window has expired first.
    for (const [key, times] of requestLog) {
      if (requestLog.size <= RATE_LIMIT_MAX_TRACKED_IPS) break;
      if (key !== ip && times.every((t) => t <= windowStart)) {
        requestLog.delete(key);
      }
    }
    // Still over the cap: evict the least-recently-active IPs.
    while (requestLog.size > RATE_LIMIT_MAX_TRACKED_IPS) {
      const oldest = requestLog.keys().next().value;
      if (oldest === undefined || oldest === ip) break;
      requestLog.delete(oldest);
    }
  }

  return false;
}

export async function GET(request: Request) {
  // First hop of x-forwarded-for is the client IP (set by the platform).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  // Too short to autocomplete meaningfully; too long is likely garbage/abuse.
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = query.toLowerCase();
  const cached = getCachedResults(cacheKey);
  if (cached) {
    return NextResponse.json({ results: cached });
  }

  try {
    const results = await autocompleteCities(query);
    setCachedResults(cacheKey, results);
    return NextResponse.json({ results });
  } catch (err) {
    // Error detail (raw upstream bodies, config hints) stays server-side;
    // anonymous clients only get a generic message.
    console.error("City autocomplete failed:", err);
    return NextResponse.json(
      { error: "City autocomplete failed." },
      { status: 502 },
    );
  }
}
