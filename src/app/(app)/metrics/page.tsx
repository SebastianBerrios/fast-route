import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import { can } from "@/features/auth/domain/permissions";
import MetricsView from "@/features/metrics/components/MetricsView";

export default async function MetricsPage() {
 const user = await getCurrentUser();
 if (!user) redirect("/login");
 if (!can(user.permissions, "metrics.view")) redirect("/");

 return (
 <main className="mx-auto max-w-4xl p-6">
 <div className="mb-6 flex items-center justify-between">
 <div>
 <h1 className="font-display text-xl font-bold tracking-tight">Métricas</h1>
 <p className="text-sm text-muted">
 Ingresos, productos y rendimiento del equipo.
 </p>
 </div>
 <Link
 href="/"
 className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 ← Volver al mapa
 </Link>
 </div>

 <MetricsView />
 </main>
 );
}
