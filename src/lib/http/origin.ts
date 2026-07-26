import { headers } from "next/headers";

/**
 * Build an origin from a Host header and an optional forwarded protocol.
 * Localhost/loopback defaults to http; everything else defaults to https.
 * Pure and testable — {@link getRequestOrigin} feeds it the live request headers.
 */
export function resolveOrigin(
  host: string | null,
  forwardedProto: string | null,
): string {
  const h = host ?? "localhost:3000";
  const isLocal = h.startsWith("localhost") || h.startsWith("127.0.0.1");
  const proto = forwardedProto ?? (isLocal ? "http" : "https");
  return `${proto}://${h}`;
}

/**
 * The origin of the current request (e.g. `https://fast-route-app.vercel.app` in
 * production, `http://localhost:3000` in dev). Used to build auth redirect URLs
 * that land back on the SAME deployment instead of the shared Supabase Site URL —
 * critical in the shared mvp-lab pool, where one project serves many app URLs.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin(h.get("host"), h.get("x-forwarded-proto"));
}
