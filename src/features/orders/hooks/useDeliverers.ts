"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Deliverer {
  id: string;
  name: string;
}

/**
 * Tenant members who can deliver (permission `orders.deliver`), for assigning
 * orders. RLS scopes the read to the current tenant.
 */
export function useDeliverers(): Deliverer[] {
  const [supabase] = useState(() => createClient());
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .contains("permissions", ["orders.deliver"])
        .order("full_name", { ascending: true });
      if (active) {
        setDeliverers(
          (data ?? []).map((p) => ({
            id: p.id,
            name: p.full_name || p.email || "Repartidor",
          })),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  return deliverers;
}
