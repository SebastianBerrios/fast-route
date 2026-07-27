import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/server";
import { can, type Permission } from "@/features/auth/domain/permissions";
import UsersTable, {
  type AdminUser,
} from "@/features/admin/components/UsersTable";
import CreateMemberForm from "@/features/admin/components/CreateMemberForm";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.permissions, "users.manage")) redirect("/");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, permissions")
    .order("created_at", { ascending: true });

  const users: AdminUser[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    permissions: p.permissions as Permission[],
  }));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">
            Usuarios y permisos
          </h1>
          <p className="text-sm text-muted">
            Creá las cuentas de tu equipo y asigná roles y acciones.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          ← Volver al mapa
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <h2 className="font-display font-semibold">Agregar al equipo</h2>
          <p className="text-sm text-muted">
            Creá la cuenta con un rol y pasale las credenciales a esa persona.
          </p>
        </div>

        <CreateMemberForm />
      </section>

      <div>
        <UsersTable users={users} currentUserId={user.id} />
        <p className="mt-3 text-xs text-muted">
          El rol aplica una plantilla de permisos; después podés ajustar acciones
          una por una. Los cambios se aplican cuando esa persona vuelve a iniciar
          sesión.
        </p>
      </div>
    </main>
  );
}
