"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/features/routing/services/openrouteservice";

export interface AuthState {
  error?: string;
  message?: string;
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
  const city = String(formData.get("city") ?? "").trim();
  const inviteCode = String(formData.get("invite_code") ?? "").trim();

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }

  const supabase = await createClient();

  if (intent === "signup") {
    // With an invite the user joins an existing business; otherwise they must
    // name the new business they're creating.
    if (!inviteCode && !businessName) {
      return { error: "Ingresá el nombre de tu negocio." };
    }

    // For a brand-new business, geocode the city so we can store the tenant's
    // region. Used later to bias address searches to that area. Geocoding is
    // best-effort — a failure must never block sign-up.
    const businessData: Record<string, string | number> = {
      business_name: businessName,
    };
    if (!inviteCode && city) {
      businessData.city = city;
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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          ...(inviteCode ? { invite_code: inviteCode } : businessData),
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
