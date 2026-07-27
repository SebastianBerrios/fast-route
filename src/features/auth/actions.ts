"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/features/routing/services/openrouteservice";
import { getRequestOrigin } from "@/lib/http/origin";

export interface AuthState {
  error?: string;
  message?: string;
}

/**
 * Parse a coordinate form field. Returns null for missing, empty, or
 * out-of-range values (note: Number("") is 0, so the empty check matters).
 */
function parseCoordinate(
  value: FormDataEntryValue | null,
  maxAbs: number,
): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && Math.abs(num) <= maxAbs ? num : null;
}

/**
 * Single entry point for sign in and sign up, driven by the form's `intent`
 * field. Designed for React's useActionState (prevState, formData) signature.
 */
export async function authenticate(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const intent = String(formData.get("intent") ?? "signin");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  // Prefer the bare city name captured when a suggestion was picked
  // ("Tacna"); the visible field holds the full disambiguation label
  // ("Tacna, Tacna, Peru") and is only a fallback.
  const city =
    String(formData.get("city_name") ?? "").trim() ||
    String(formData.get("city") ?? "").trim();
  const rawCountry = String(formData.get("country") ?? "").trim();
  // Country must look like an ISO 3166-1 alpha-2/alpha-3 code; anything else
  // is client-tampered or garbage and is treated as missing.
  const country = /^[A-Za-z]{2,3}$/.test(rawCountry) ? rawCountry : "";
  const centerLng = parseCoordinate(formData.get("center_lng"), 180);
  const centerLat = parseCoordinate(formData.get("center_lat"), 90);

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }

  const supabase = await createClient();

  if (intent === "signup") {
    // Signing up only ever creates a NEW business. Joining an existing one is
    // not self-service: an admin of that business creates the account
    // server-side (features/admin/actions.ts), because in the shared mvp-lab
    // auth pool membership must be an explicit act by an admin of THIS app.
    if (!businessName) {
      return { error: "Ingresá el nombre de tu negocio." };
    }

    // For a brand-new business, store the tenant's region. Used later to bias
    // address searches to that area. The form's city autocomplete already
    // supplies the coordinates and country; geocoding the free text is only a
    // fallback and is best-effort — a failure must never block sign-up.
    const businessData: Record<string, string | number> = {
      business_name: businessName,
    };
    if (city) {
      businessData.city = city;
      if (centerLng != null && centerLat != null) {
        businessData.center_lng = centerLng;
        businessData.center_lat = centerLat;
        if (country) businessData.country = country;
      } else {
        try {
          const [match] = await geocodeAddress(city);
          if (match) {
            businessData.center_lng = match.lng;
            businessData.center_lat = match.lat;
            if (match.country) businessData.country = match.country;
          }
        } catch {
          // Ignore: tenant is created without coordinates; map falls back.
        }
      }
    }

    // Confirmation emails must return the user to THIS deployment, not the shared
    // Supabase Site URL — one mvp-lab project serves many app URLs, so relying on
    // the single Site URL would send deployed users to localhost.
    const origin = await getRequestOrigin();
    // The enrollment intent is namespaced under `fast_route` so that ONLY this
    // app's signup form can drive membership. In the shared mvp-lab auth pool,
    // generic top-level keys could collide with other apps; enroll_self() reads
    // exclusively from raw_user_meta_data -> 'fast_route'.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/login`,
        data: {
          full_name: fullName,
          fast_route: businessData,
        },
      },
    });
    if (error) return { error: error.message };

    // When email confirmation is enabled, no session is returned yet.
    if (!data.session) {
      return {
        message: "Cuenta creada. Revisá tu email para confirmarla y luego ingresá.",
      };
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: error.message };
  }

  // Enrollment is an explicit fast_route action, never a side effect of signing
  // in to the shared auth pool. Idempotent, and a no-op for anyone who did not
  // sign up through this app. Runs on the first authenticated session, covering
  // both immediate-session sign-up and the post-confirmation sign-in.
  const { error: enrollError } = await supabase.rpc("enroll_self");
  if (enrollError) return { error: enrollError.message };
  // Refresh so the role/permissions claims written during enrollment land in the
  // JWT before the app reads them via getCurrentUser. A failure here is
  // non-fatal: the enrollment is already committed, and SessionSync (on focus)
  // plus the next sign-in reconcile the claims. The only effect is a brief
  // under-privileged render — never elevated access.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.error("enroll_self: session refresh failed", refreshError.message);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/** Sign the current user out and return them to the login page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
