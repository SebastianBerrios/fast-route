"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { can, type Permission } from "@/features/auth/domain/permissions";
import { isOnboardingDismissed } from "@/features/shell/onboarding/dismissal";

export type OnboardingStepId = "products" | "customers" | "team";

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
}

interface Counts {
  products: number;
  customers: number;
  team: number;
  pendingInvites: number;
}

const STEP_PERMISSIONS: Record<OnboardingStepId, Permission> = {
  products: "products.manage",
  customers: "customers.manage",
  team: "users.manage",
};

function computeSteps(
  counts: Counts,
  permissions: Permission[],
): OnboardingStep[] {
  // Master gate: the setup flow is for business owners (products.manage).
  // Invited members (sellers, drivers) never see the card or the wizard,
  // even when they hold permissions for individual steps.
  if (!can(permissions, "products.manage")) return [];
  const all: OnboardingStep[] = [
    { id: "products", done: counts.products > 0 },
    { id: "customers", done: counts.customers > 0 },
    // Outstanding invites count as done: the owner already did their part.
    { id: "team", done: counts.team > 1 || counts.pendingInvites > 0 },
  ];
  return all.filter((s) => can(permissions, STEP_PERMISSIONS[s.id]));
}

/**
 * Live setup progress for a new business, derived from real data counts:
 * a step is done when the data exists, no manual check-off involved.
 * Steps the user has no permission for are excluded entirely.
 *
 * `autoOpenSteps` freezes the steps pending at first load when the wizard
 * should open by itself (something incomplete and not previously dismissed).
 */
export function useOnboardingSteps(userId: string, permissions: Permission[]) {
  const [supabase] = useState(() => createClient());
  const [counts, setCounts] = useState<Counts | null>(null);
  const [autoOpenSteps, setAutoOpenSteps] = useState<
    OnboardingStepId[] | null
  >(null);
  const mounted = useRef(true);
  const firstLoad = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const [p, c, t, i] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      // Same pending filter as the admin invites list (used_at is null).
      supabase
        .from("invites")
        .select("id", { count: "exact", head: true })
        .is("used_at", null),
    ]);
    if (!mounted.current) return;
    const next: Counts = {
      products: p.count ?? 0,
      customers: c.count ?? 0,
      team: t.count ?? 0,
      pendingInvites: i.count ?? 0,
    };
    setCounts(next);

    if (firstLoad.current) {
      firstLoad.current = false;
      const pending = computeSteps(next, permissions).filter((s) => !s.done);
      if (pending.length > 0 && !isOnboardingDismissed(userId)) {
        setAutoOpenSteps(pending.map((s) => s.id));
      }
    }
  }, [supabase, permissions, userId]);

  useEffect(() => {
    // Initial fetch on mount — same pattern as the other data hooks here
    // (useProducts, useCustomers); state is set after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const steps = useMemo<OnboardingStep[]>(
    () => (counts ? computeSteps(counts, permissions) : []),
    [counts, permissions],
  );

  return {
    steps,
    loading: counts === null,
    refresh,
    autoOpenSteps,
  };
}
