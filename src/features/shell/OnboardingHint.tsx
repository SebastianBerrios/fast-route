"use client";

import { useState } from "react";
import Link from "next/link";
import type { Permission } from "@/features/auth/domain/permissions";
import type { Coordinate } from "@/features/routing/domain/types";
import {
  useOnboardingSteps,
  type OnboardingStepId,
} from "@/features/shell/onboarding/useOnboardingSteps";
import OnboardingWizard from "@/features/shell/onboarding/OnboardingWizard";

const CARD_STEPS: Record<OnboardingStepId, { href: string; label: string }> = {
  products: { href: "/products", label: "Cargá tus productos y stock" },
  customers: { href: "/customers", label: "Registrá tus clientes" },
  team: { href: "/admin/users", label: "Invitá a tu equipo" },
};

/**
 * Onboarding entry point: auto-opens the full-screen setup wizard for a new
 * business (until dismissed) and renders the fallback checklist card that can
 * reopen it. Each step checks off automatically as the data is created; the
 * card disappears once setup is complete.
 */
export default function OnboardingHint({
  userId,
  permissions,
  defaultCenter,
}: {
  userId: string;
  permissions: Permission[];
  /** The tenant's stored region, forwarded to the wizard's location picker. */
  defaultCenter?: Coordinate;
}) {
  const { steps, loading, refresh, autoOpenSteps } = useOnboardingSteps(
    userId,
    permissions,
  );
  const [manualSteps, setManualSteps] = useState<OnboardingStepId[] | null>(
    null,
  );
  const [wizardClosed, setWizardClosed] = useState(false);

  // First landing after signup: the hook resolves auto-open once counts load.
  // A manual reopen (from the card) always wins over the frozen auto state.
  const wizardStepIds =
    manualSteps ?? (wizardClosed ? null : autoOpenSteps);

  const closeWizard = () => {
    setManualSteps(null);
    setWizardClosed(true);
  };

  const openWizard = () => {
    const pending = steps.filter((s) => !s.done);
    if (pending.length > 0) setManualSteps(pending.map((s) => s.id));
  };

  const showCard = !loading && steps.length > 0 && steps.some((s) => !s.done);

  return (
    <>
      {showCard && (
        <section className="rounded-xl border border-brand/40 bg-brand/5 p-3">
          <p className="mb-2 text-sm font-semibold">👋 Primeros pasos</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span>{s.done ? "✅" : "⬜"}</span>
                {s.done ? (
                  <span className="text-muted line-through">
                    {CARD_STEPS[s.id].label}
                  </span>
                ) : (
                  <Link
                    href={CARD_STEPS[s.id].href}
                    className="text-brand hover:underline"
                  >
                    {CARD_STEPS[s.id].label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={openWizard}
            className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand/90"
          >
            ✨ Completar configuración
          </button>
        </section>
      )}

      {wizardStepIds && wizardStepIds.length > 0 && (
        <OnboardingWizard
          userId={userId}
          stepIds={wizardStepIds}
          defaultCenter={defaultCenter}
          onStepCompleted={() => void refresh()}
          onClose={closeWizard}
        />
      )}
    </>
  );
}
