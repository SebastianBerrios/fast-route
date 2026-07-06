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

/**
 * Live positions of the tenant's drivers (excluding the current user),
 * refreshed in real time. For fleet monitoring on the map.
 */
export function useTenantDrivers(currentUserId: string): LiveDriver[] {
  const [supabase] = useState(() => createClient());
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);

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
        .filter((r) => r.user_id !== currentUserId)
        .map((r) => ({
          userId: r.user_id,
          name: names.get(r.user_id) ?? "Repartidor",
          lng: r.lng,
          lat: r.lat,
          updatedAt: r.updated_at,
        })),
    );
  }, [supabase, currentUserId]);

  useEffect(() => {
    fetchDrivers();
    const channel = supabase
      .channel("driver-locations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        () => fetchDrivers(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchDrivers]);

  return drivers;
}
