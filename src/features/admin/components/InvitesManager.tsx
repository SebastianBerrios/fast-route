"use client";

import { useEffect, useState, useTransition } from "react";
import { createInvite, revokeInvite } from "@/features/admin/actions";
import { ROLE_LABELS, roleLabel, type UserRole } from "@/features/auth/domain/roles";

export interface AdminInvite {
  id: string;
  code: string;
  role: UserRole;
  expiresAt: string;
}

const ROLE_OPTIONS: UserRole[] = ["driver", "seller", "admin"];

function inviteUrl(origin: string, code: string) {
  return `${origin}/login?invite=${code}`;
}

export default function InvitesManager({
  invites,
}: {
  invites: AdminInvite[];
}) {
  const [origin, setOrigin] = useState("");
  const [role, setRole] = useState<UserRole>("driver");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setOrigin(window.location.origin), []);

  const generate = () => {
    startTransition(async () => {
      const res = await createInvite(role);
      if (res.error) setError(res.error);
      else {
        setError(null);
        setLastCode(res.code);
      }
    });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(origin, code));
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard blocked — the link is visible to copy manually
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="font-display font-semibold">Invitar al equipo</h2>
        <p className="text-sm text-muted">
          Generá un link para que un miembro se una a tu negocio con un rol.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-brand"
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
          />
          <button
            type="button"
            onClick={() => copy(lastCode)}
            className="shrink-0 rounded-md bg-brand px-2 py-1 text-xs font-medium text-white"
          >
            {copied === lastCode ? "¡Copiado!" : "Copiar link"}
          </button>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="flex flex-col gap-1">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm"
            >
              <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
                {roleLabel(inv.role)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {inviteUrl(origin, inv.code)}
              </span>
              <button
                type="button"
                onClick={() => copy(inv.code)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-brand hover:bg-brand/10"
              >
                {copied === inv.code ? "¡Copiado!" : "Copiar"}
              </button>
              <button
                type="button"
                onClick={() => void revokeInvite(inv.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
              >
                Revocar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
