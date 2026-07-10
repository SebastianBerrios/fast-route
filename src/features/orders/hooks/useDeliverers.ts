"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Deliverer {
  id: string;
  name: string;
}

export interface UseDeliverers {
  deliverers: Deliverer[];
  /** True until the first fetch resolves. */
  loading: boolean;
}

/**
 * Tenant members who can deliver (permission `orders.deliver`), for assigning
 * orders. RLS scopes the read to the current tenant.
 */
export function useDeliverers(): UseDeliverers {
  const [supabase] = useState(() => createClient());
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  return { deliverers, loading };
}
