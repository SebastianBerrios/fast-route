"use client";

import { useState, useTransition } from "react";
import { revokeInvite } from "@/features/admin/actions";
import { roleLabel, type UserRole } from "@/features/auth/domain/roles";
import InviteGenerator, {
  inviteUrl,
  useOrigin,
} from "@/features/admin/components/InviteGenerator";

export interface AdminInvite {
  id: string;
  code: string;
  role: UserRole;
  expiresAt: string;
}

export default function InvitesManager({
  invites,
}: {
  invites: AdminInvite[];
}) {
  const origin = useOrigin();
  const [copied, setCopied] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Per-id pending set: concurrent revokes must not clear each other's state.
  const [revokingIds, setRevokingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(origin, code));
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard blocked — the link is visible to copy manually
    }
  };

  const handleRevoke = (id: string) => {
    setRevokingIds((prev) => new Set(prev).add(id));
    setRevokeError(null);
    startTransition(async () => {
      try {
        const res = await revokeInvite(id);
        setRevokeError(res.error);
      } catch {
        setRevokeError("No se pudo revocar la invitación. Probá de nuevo.");
      } finally {
        setRevokingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="font-display font-semibold">Invitar al equipo</h2>
        <p className="text-sm text-muted">
          Generá un link para que un miembro se una a tu negocio con un rol.
        </p>
      </div>

      <InviteGenerator />

      {revokeError && (
        <p className="text-sm text-red-600" role="alert">
          {revokeError}
        </p>
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
                onClick={() => handleRevoke(inv.id)}
                disabled={revokingIds.has(inv.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50"
              >
                {revokingIds.has(inv.id) ? "Revocando…" : "Revocar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
