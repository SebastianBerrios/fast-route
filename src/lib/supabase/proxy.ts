import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

/** Routes reachable without a session. Everything else requires auth. */
// /api/cities backs the city autocomplete on the (unauthenticated) signup form.
const PUBLIC_PATHS = ["/login", "/api/cities"];

/**
 * Refreshes the Supabase session on every request and enforces auth.
 * Runs from Next.js's proxy (the file formerly known as middleware).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do NOT run code between createServerClient and getUser().
  // getUser() revalidates the token with the Auth server (safe on the server).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Exact-or-slash matching so e.g. /api/cities-admin is NOT public.
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );

  // Not signed in and trying to reach something protected.
  if (!user && !isPublic) {
    // API routes expect JSON, not an HTML redirect. Fail cleanly with 401.
    if (path.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  // Signed in but on the login page -> send to the app.
  if (user && path.startsWith("/login")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  return supabaseResponse;
}

/** Preserve any refreshed auth cookies when we return a redirect. */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
