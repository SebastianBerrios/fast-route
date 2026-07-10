"use client";

import dynamic from "next/dynamic";
import { useTenantDrivers } from "@/features/tracking/hooks/useTenantDrivers";
import { ListRowsSkeleton, MapSkeleton } from "@/features/shell/ui/Skeleton";
import type { Coordinate } from "@/features/routing/domain/types";

const FleetMap = dynamic(
  () => import("@/features/tracking/components/FleetMap"),
  {
    ssr: false,
    // Same MapSkeleton as the post-mount tile overlay — no flash between them.
    loading: () => <MapSkeleton />,
  },
);

function since(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Passing "" as the "current user" includes every driver (nothing is excluded).
export default function FleetView({
  defaultCenter,
}: {
  /** The tenant's stored region, used to center the map. */
  defaultCenter?: Coordinate;
}) {
  const { drivers, loading } = useTenantDrivers("");

  return (
    <div className="flex h-full flex-col gap-3 md:flex-row">
      <div className="h-[50vh] flex-1 overflow-hidden rounded-xl border border-line md:h-full">
        <FleetMap drivers={drivers} defaultCenter={defaultCenter} />
      </div>
      <aside className="w-full shrink-0 md:w-72">
        <h2 className="mb-2 text-sm font-semibold text-muted">
          Repartidores en línea{loading ? "" : ` (${drivers.length})`}
        </h2>
        {loading ? (
          <div className="rounded-lg border border-line">
            <ListRowsSkeleton rows={3} label="Cargando repartidores…" />
          </div>
        ) : drivers.length === 0 ? (
          <p className="rounded-lg border border-line p-3 text-sm text-muted">
            Ningún repartidor está compartiendo su ubicación ahora mismo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {drivers.map((d) => (
              <li
                key={d.userId}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm"
              >
                <span className="text-lg">🛵</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="text-xs text-muted">
                    Actualizado {since(d.updatedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
