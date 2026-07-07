import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import { getTenantLocation } from "@/features/tenants/server";
import { can } from "@/features/auth/domain/permissions";
import FleetView from "@/features/tracking/components/FleetView";

export default async function FleetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.permissions, "customers.manage")) redirect("/");

  const { center } = await getTenantLocation();

  return (
    <main className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">
            Flota en vivo
          </h1>
          <p className="text-sm text-muted">
            Ubicación de tus repartidores en tiempo real.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          ← Volver al mapa
        </Link>
      </div>

      <div className="min-h-0 flex-1">
        <FleetView defaultCenter={center ?? undefined} />
      </div>
    </main>
  );
}
