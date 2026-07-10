"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Role and permission changes are written into the JWT app_metadata by a DB
 * trigger (private.sync_role_to_app_metadata), but a signed-in user keeps their
 * old claims until their token is refreshed. Refresh the session when the tab
 * regains focus so an admin's change to a user's role/permissions takes effect
 * on that user's next navigation, without forcing a manual re-login. Throttled
 * so flipping focus repeatedly does not spam the token endpoint.
 */
const REFRESH_THROTTLE_MS = 30_000;

export default function SessionSync() {
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let lastRefresh = 0;
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh < REFRESH_THROTTLE_MS) return;
      lastRefresh = now;
      void supabase.auth.refreshSession();
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    return () =>
      document.removeEventListener("visibilitychange", maybeRefresh);
  }, [supabase]);

  return null;
}
