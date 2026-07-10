"use client";

import { useEffect, useState, useTransition } from "react";
import { createInvite } from "@/features/admin/actions";
import { ROLE_LABELS, type UserRole } from "@/features/auth/domain/roles";

const ROLE_OPTIONS: UserRole[] = ["driver", "seller", "admin"];

export function inviteUrl(origin: string, code: string) {
  return `${origin}/login?invite=${code}`;
}

/**
 * Empty during SSR and the initial client render; the real origin is set in
 * an effect so the hydrated HTML matches the server output.
 */
export function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // Deliberate post-hydration set: reading window during render would make
    // the client HTML diverge from the SSR output and break hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);
  return origin;
}

interface InviteGeneratorProps {
  /** Called after an invite link is successfully generated. */
  onGenerated?: (code: string) => void;
}

/**
 * Role picker + invite link generation. Standalone so it can be embedded
 * both in the admin panel and in the onboarding wizard.
 */
export default function InviteGenerator({ onGenerated }: InviteGeneratorProps) {
  const origin = useOrigin();
  const [role, setRole] = useState<UserRole>("driver");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      const res = await createInvite(role);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setLastCode(res.code);
        if (res.code) onGenerated?.(res.code);
      }
    });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(origin, code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the link is visible to copy manually
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          aria-label="Rol del invitado"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending ? "Generando…" : "Generar invitación"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {lastCode && (
        <div className="flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/5 p-2">
          <input
            readOnly
            value={inviteUrl(origin, lastCode)}
            className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link de invitación"
          />
          <button
            type="button"
            onClick={() => copy(lastCode)}
            className="shrink-0 rounded-md bg-brand px-2 py-1 text-xs font-medium text-white"
          >
            {copied ? "¡Copiado!" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}
