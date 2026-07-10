"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Coordinate } from "@/features/routing/domain/types";

const UPSERT_EVERY_MS = 8000; // throttle DB writes while moving

export interface LiveLocation {
  sharing: boolean;
  coord: Coordinate | null;
  error: string | null;
  /** True while a one-shot getCurrentPosition request is in flight. */
  locating: boolean;
  toggle: () => void;
  /** One-shot: read the current GPS position without broadcasting. */
  locateOnce: () => void;
}

/**
 * Shares the current user's live GPS position into driver_locations while
 * enabled. Also exposes the latest coordinate so the planner can use it as
 * the route's starting point.
 */
export function useLiveLocation(userId: string): LiveLocation {
  const [supabase] = useState(() => createClient());
  const [sharing, setSharing] = useState(false);
  const [coord, setCoord] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastUpsert = useRef(0);

  const clearWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Este dispositivo no permite geolocalización.");
      return;
    }
    setError(null);
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setCoord(c);
        const now = Date.now();
        if (now - lastUpsert.current > UPSERT_EVERY_MS) {
          lastUpsert.current = now;
          void supabase.from("driver_locations").upsert({
            user_id: userId,
            lng: c.lng,
            lat: c.lat,
            updated_at: new Date().toISOString(),
          });
        }
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado."
            : "No se pudo obtener la ubicación.",
        );
        clearWatch();
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [supabase, userId, clearWatch]);

  const stop = useCallback(() => {
    clearWatch();
    setSharing(false);
    // Remove the shared position so the driver drops off the live map.
    void supabase.from("driver_locations").delete().eq("user_id", userId);
  }, [clearWatch, supabase, userId]);

  const toggle = useCallback(() => {
    if (sharing) stop();
    else start();
  }, [sharing, start, stop]);

  const locateOnce = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Este dispositivo no permite geolocalización.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoord({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setError(null);
        setLocating(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado."
            : "No se pudo obtener la ubicación.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  // Stop watching on unmount (keep last shared position).
  useEffect(() => clearWatch, [clearWatch]);

  return { sharing, coord, error, locating, toggle, locateOnce };
}
