"use client";

import { useState, useTransition } from "react";
import {
 revokeTeamMemberAccess,
 updateUserPermissions,
 updateUserRole,
} from "@/features/admin/actions";
import { ROLE_LABELS, type UserRole } from "@/features/auth/domain/roles";
import {
 PERMISSIONS,
 PERMISSION_LABELS,
 ROLE_DEFAULT_PERMISSIONS,
 type Permission,
} from "@/features/auth/domain/permissions";

export interface AdminUser {
 id: string;
 email: string | null;
 full_name: string | null;
 role: UserRole;
 permissions: Permission[];
}

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
 const [role, setRole] = useState<UserRole>(user.role);
 const [perms, setPerms] = useState<Set<Permission>>(
 new Set(user.permissions),
 );
 const [open, setOpen] = useState(false);
 const [confirmingRevoke, setConfirmingRevoke] = useState(false);
 const [isPending, startTransition] = useTransition();
 const [error, setError] = useState<string | null>(null);

 const handleRole = (next: UserRole) => {
 setRole(next);
 setPerms(new Set(ROLE_DEFAULT_PERMISSIONS[next])); // apply template
 startTransition(async () => {
 const res = await updateUserRole(user.id, next);
 setError(res.error);
 });
 };

 const handleRevoke = () => {
 startTransition(async () => {
 setError(null);
 try {
 const res = await revokeTeamMemberAccess(user.id);
 if (res.error) {
 setError(res.error);
 setConfirmingRevoke(false);
 }
 // On success the row disappears with the revalidated page; leaving the
 // confirm open avoids a flash of "Quitar acceso" on a doomed row.
 } catch {
 setError("No se pudo quitar el acceso. Probá de nuevo.");
 setConfirmingRevoke(false);
 }
 });
 };

 const togglePerm = (permission: Permission) => {
 const next = new Set(perms);
 if (next.has(permission)) next.delete(permission);
 else next.add(permission);
 setPerms(next);
 startTransition(async () => {
 const res = await updateUserPermissions(user.id, [...next]);
 setError(res.error);
 });
 };

 return (
 <li className="p-3 text-sm">
 <div className="flex flex-wrap items-center gap-3">
 <div className="min-w-0 flex-1">
 <p className="font-medium">{user.full_name || "—"}</p>
 <p className="text-muted">{user.email}</p>
 </div>
 <select
 value={role}
 disabled={isPending}
 onChange={(e) => handleRole(e.target.value as UserRole)}
 className="rounded-lg border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-brand disabled:opacity-50"
 >
 {ROLE_OPTIONS.map((r) => (
 <option key={r} value={r}>
 {ROLE_LABELS[r]}
 </option>
 ))}
 </select>
 <button
 type="button"
 onClick={() => setOpen((v) => !v)}
 className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 Permisos ({perms.size}) {open ? "▲" : "▼"}
 </button>
 {!isSelf && !confirmingRevoke && (
 <button
 type="button"
 onClick={() => setConfirmingRevoke(true)}
 disabled={isPending}
 className="rounded-md px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
 >
 Quitar acceso
 </button>
 )}
 {isPending && <span className="text-xs text-muted">Guardando…</span>}
 {error && (
 <span className="text-xs text-red-600" role="alert">
 {error}
 </span>
 )}
 </div>

 {confirmingRevoke && (
 <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-2.5">
 <p className="min-w-0 flex-1 text-xs">
 Esta persona pierde el acceso al negocio. Su cuenta sigue existiendo,
 así que <strong>no vas a poder volver a agregarla con este email</strong>
 : si algún día vuelve, va a necesitar otra dirección.
 </p>
 <button
 type="button"
 onClick={handleRevoke}
 disabled={isPending}
 className="shrink-0 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600/90 disabled:opacity-50"
 >
 {isPending ? "Quitando…" : "Sí, quitar acceso"}
 </button>
 <button
 type="button"
 onClick={() => setConfirmingRevoke(false)}
 disabled={isPending}
 className="shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
 >
 Cancelar
 </button>
 </div>
 )}

 {open && (
 <div className="mt-2 grid grid-cols-1 gap-1 border-t border-line pt-2 sm:grid-cols-2 ">
 {PERMISSIONS.map((p) => (
 <label key={p} className="flex items-center gap-2 text-xs">
 <input
 type="checkbox"
 checked={perms.has(p)}
 disabled={isPending}
 onChange={() => togglePerm(p)}
 />
 {PERMISSION_LABELS[p]}
 </label>
 ))}
 </div>
 )}
 </li>
 );
}

export default function UsersTable({
 users,
 currentUserId,
}: {
 users: AdminUser[];
 /** Used to hide the revoke control on your own row — removing your own
  * membership is a lockout, and the server refuses it anyway. */
 currentUserId: string;
}) {
 return (
 <ul className="divide-y divide-line rounded-xl border border-line">
 {users.map((user) => (
 <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} />
 ))}
 </ul>
 );
}
