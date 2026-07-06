import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/server";
import { can, type Permission } from "@/features/auth/domain/permissions";
import UsersTable, {
  type AdminUser,
} from "@/features/admin/components/UsersTable";
import InvitesManager, {
  type AdminInvite,
} from "@/features/admin/components/InvitesManager";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.permissions, "users.manage")) redirect("/");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, permissions")
    .order("created_at", { ascending: true });

  const { data: inviteRows } = await supabase
    .from("invites")
    .select("id, code, role, expires_at")
    .is("used_at", null)
    .order("created_at", { ascending: false });

  const users: AdminUser[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    permissions: p.permissions as Permission[],
  }));

  const invites: AdminInvite[] = (inviteRows ?? []).map((i) => ({
    id: i.id,
    code: i.code,
    role: i.role,
    expiresAt: i.expires_at,
  }));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">
            Usuarios y permisos
          </h1>
          <p className="text-sm text-muted">
            Invitá a tu equipo y asigná roles y acciones.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          ← Volver al mapa
        </Link>
      </div>

      <InvitesManager invites={invites} />

      <div>
        <UsersTable users={users} />
        <p className="mt-3 text-xs text-muted">
          El rol aplica una plantilla de permisos; después podés ajustar acciones
          una por una. Los cambios se aplican cuando esa persona vuelve a iniciar
          sesión.
        </p>
      </div>
    </main>
  );
}
