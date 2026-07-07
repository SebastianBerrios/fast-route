import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import { getTenantLocation } from "@/features/tenants/server";
import { can } from "@/features/auth/domain/permissions";
import CustomersManager from "@/features/customers/components/CustomersManager";

export default async function CustomersPage() {
 const user = await getCurrentUser();
 if (!user) redirect("/login");
 if (!can(user.permissions, "customers.manage")) redirect("/");

 const { center } = await getTenantLocation();

 return (
 <main className="mx-auto max-w-3xl p-6">
 <div className="mb-6 flex items-center justify-between">
 <div>
 <h1 className="font-display text-xl font-bold tracking-tight">Clientes</h1>
 <p className="text-sm text-muted">
 Gestioná tus clientes y su ubicación de entrega.
 </p>
 </div>
 <Link
 href="/"
 className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 ← Volver al mapa
 </Link>
 </div>

 <CustomersManager userId={user.id} defaultCenter={center ?? undefined} />
 </main>
 );
}
