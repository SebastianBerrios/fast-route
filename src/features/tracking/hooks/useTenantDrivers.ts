"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface LiveDriver {
  userId: string;
  name: string;
  lng: number;
  lat: number;
  updatedAt: string;
}

export interface UseTenantDrivers {
  drivers: LiveDriver[];
  /** True until the first fetch resolves — distinguishes "loading" from "no drivers". */
  loading: boolean;
}

// Realtime topics must be unique per subscription: the singleton client
// reuses channels by topic, and re-subscribing a live one throws (see
// useProducts for the full story). This hook mounts in both RoutePlanner
// and FleetView, so a fixed topic would collide when they coexist.
let channelSeq = 0;

/**
 * Live positions of the tenant's drivers (excluding the current user),
 * refreshed in real time. For fleet monitoring on the map.
 */
export function useTenantDrivers(currentUserId: string): UseTenantDrivers {
  const [supabase] = useState(() => createClient());
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrivers = useCallback(async () => {
    const { data } = await supabase
      .from("driver_locations")
      .select("user_id, lng, lat, updated_at");
    const rows = data ?? [];

    const names = new Map<string, string>();
    const ids = rows.map((r) => r.user_id);
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profs ?? []) {
        names.set(p.id, p.full_name || p.email || "Repartidor");
      }
    }

    setDrivers(
      rows
        .filter(
          (r) => r.user_id !== currentUserId && r.lng != null && r.lat != null,
        )
        .map((r) => ({
          userId: r.user_id,
          name: names.get(r.user_id) ?? "Repartidor",
          lng: r.lng,
          lat: r.lat,
          updatedAt: r.updated_at,
        })),
    );
    setLoading(false);
  }, [supabase, currentUserId]);

  useEffect(() => {
    fetchDrivers();
    const channel = supabase
      .channel(`driver-locations-realtime-${++channelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "fast_route", table: "driver_locations" },
        () => fetchDrivers(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchDrivers]);

  return { drivers, loading };
}
