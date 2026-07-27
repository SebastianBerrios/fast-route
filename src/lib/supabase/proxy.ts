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
  const isNoAccess = path === "/no-access";

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

  if (user) {
    // A valid session in the shared mvp-lab auth pool is NOT proof of belonging.
    // Membership is proven by the JWT claims the enrollment sync trigger writes
    // under the app's OWN key: app_metadata is one blob shared by every app in
    // the project, so a top-level `role` proves nothing about fast_route.
    const claims = (user.app_metadata?.fast_route ?? {}) as {
      role?: string;
      tenant_id?: string;
    };
    const isMember = Boolean(claims.role && claims.tenant_id);

    // On the login page: members go into the app, non-members to the wall.
    if (path.startsWith("/login")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = isMember ? "/" : "/no-access";
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }

    // Authenticated non-member reaching the app -> dead end. NEVER /login: they
    // hold a valid session, so /login would just bounce back here (a loop).
    if (!isMember && !isNoAccess && !isPublic) {
      if (path.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/no-access";
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }

    // A member has no business on the wall.
    if (isMember && isNoAccess) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }
  }

  return supabaseResponse;
}

/** Preserve any refreshed auth cookies when we return a redirect. */
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
