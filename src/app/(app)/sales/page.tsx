import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import { can } from "@/features/auth/domain/permissions";
import SalesView from "@/features/sales/components/SalesView";

export default async function SalesPage() {
 const user = await getCurrentUser();
 if (!user) redirect("/login");
 if (!can(user.permissions, "sales.view")) redirect("/");

 return (
 <main className="mx-auto max-w-3xl p-6">
 <div className="mb-6 flex items-center justify-between">
 <div>
 <h1 className="font-display text-xl font-bold tracking-tight">Ventas</h1>
 <p className="text-sm text-muted">
 Historial de entregas concretadas.
 </p>
 </div>
 <Link
 href="/"
 className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 ← Volver al mapa
 </Link>
 </div>

 <SalesView />
 </main>
 );
}
