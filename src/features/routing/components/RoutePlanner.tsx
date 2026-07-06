"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDeliveryPlanner } from "@/features/routing/hooks/useDeliveryPlanner";
import { formatDistance, formatDuration } from "@/features/routing/lib/geo";
import {
  googleMapsPointUrl,
  googleMapsRouteUrl,
  MAX_ROUTE_STOPS,
  wazePointUrl,
} from "@/features/routing/lib/navLinks";
import StopList from "@/features/routing/components/StopList";
import OrderForm from "@/features/orders/components/OrderForm";
import { useDeliverers } from "@/features/orders/hooks/useDeliverers";
import OnboardingHint from "@/features/shell/OnboardingHint";
import { can, type Permission } from "@/features/auth/domain/permissions";
import { formatPrice } from "@/features/products/domain/types";
import type {
  NewOrderInput,
  NewOrderItemInput,
} from "@/features/orders/domain/types";

const RouteMap = dynamic(
  () => import("@/features/routing/components/RouteMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background text-muted">
        Cargando mapa…
      </div>
    ),
  },
);

interface RoutePlannerProps {
  userId: string;
  permissions: Permission[];
}

const navLinkClass =
  "flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10";

export default function RoutePlanner({
  userId,
  permissions,
}: RoutePlannerProps) {
  const canCreate = can(permissions, "orders.create");
  const canDeliver = can(permissions, "orders.deliver");
  const canManage = can(permissions, "orders.manage");

  const planner = useDeliveryPlanner(userId);
  const deliverers = useDeliverers();
  const {
    driver,
    orderedOrders,
    orderedStops,
    route,
    optimizeStatus,
    optimizeError,
    ordersError,
    returnToStart,
  } = planner;

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stopCoords = orderedStops.map((s) => s.coordinate);
  const nextStop = orderedStops[0]?.coordinate;
  const showNav = canDeliver && orderedStops.length > 0;

  const handleCreate = async (
    input: NewOrderInput,
    items: Omit<NewOrderItemInput, "orderId">[],
  ) => {
    setSubmitting(true);
    const ok = await planner.createOrderWithItems(input, items);
    setSubmitting(false);
    if (ok) setShowForm(false);
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Map */}
      <div className="relative h-[45vh] w-full md:h-full md:flex-1">
        <RouteMap
          driver={driver}
          orderedStops={orderedStops}
          route={route}
          otherDrivers={planner.otherDrivers}
        />
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-line bg-surface/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
          {driver
            ? "📍 Tu ubicación es el punto de partida"
            : "📍 Activá tu ubicación para calcular la ruta"}
        </div>
      </div>

      {/* Planner panel */}
      <aside className="flex w-full flex-col gap-4 overflow-y-auto border-t border-line bg-surface p-4 md:w-96 md:border-l md:border-t-0">
        <header>
          <h1 className="font-display text-lg font-bold tracking-tight">
            Planificador de ruta
          </h1>
          <p className="text-sm text-muted">Optimización en tiempo real</p>
        </header>

        <OnboardingHint permissions={permissions} />

        {canCreate && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand/90"
          >
            + Nuevo pedido
          </button>
        )}

        {/* Summary */}
        <section className="rounded-xl border border-line bg-background p-3">
          {optimizeStatus === "optimizing" && (
            <p className="text-sm text-brand">Optimizando ruta…</p>
          )}
          {optimizeStatus === "error" && (
            <p className="text-sm text-red-600">{optimizeError}</p>
          )}
          {optimizeStatus === "idle" && route && (
            <div className="flex gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  Tiempo
                </p>
                <p className="font-display text-xl font-bold">
                  {formatDuration(route.durationSeconds)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">
                  Distancia
                </p>
                <p className="font-display text-xl font-bold">
                  {formatDistance(route.distanceMeters)}
                </p>
              </div>
            </div>
          )}
          {optimizeStatus === "idle" && !route && (
            <p className="text-sm text-muted">
              {driver
                ? "Agregá al menos un pedido para calcular la ruta óptima."
                : "Activá tu ubicación para empezar."}
            </p>
          )}
        </section>

        {/* External navigation */}
        {showNav && (
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Navegación
            </p>
            <a
              href={googleMapsRouteUrl(stopCoords)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand/90"
            >
              🗺️ Abrir ruta completa
            </a>
            {orderedStops.length > MAX_ROUTE_STOPS && (
              <p className="text-xs text-muted">
                Google Maps abre las primeras {MAX_ROUTE_STOPS} paradas.
              </p>
            )}
            {nextStop && (
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={googleMapsPointUrl(nextStop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={navLinkClass}
                >
                  📍 Próximo · Maps
                </a>
                <a
                  href={wazePointUrl(nextStop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={navLinkClass}
                >
                  📍 Próximo · Waze
                </a>
              </div>
            )}
          </section>
        )}

        {ordersError && (
          <p className="text-sm text-red-600" role="alert">
            {ordersError}
          </p>
        )}

        {/* Location + route controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={planner.locateMe}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            📍 Actualizar mi ubicación
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={returnToStart}
              onChange={(e) => planner.setReturnToStart(e.target.checked)}
            />
            Volver al inicio
          </label>
        </div>
        {planner.liveError && (
          <p className="text-sm text-red-600">{planner.liveError}</p>
        )}

        {canDeliver && planner.lockedOrderId && (
          <button
            type="button"
            onClick={planner.optimizeRoute}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand/90"
          >
            🔄 Optimizar ruta (libera el pedido en camino)
          </button>
        )}

        {canDeliver && (
          <button
            type="button"
            onClick={planner.toggleLiveShare}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              planner.liveShare
                ? "bg-green-600 text-white hover:bg-green-700"
                : "border border-line hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {planner.liveShare
              ? "📡 Compartiendo ubicación — tocá para parar"
              : "📡 Compartir mi ubicación en vivo"}
          </button>
        )}

        {/* Orders */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center justify-between text-sm font-semibold text-muted">
            <span>Pedidos ({orderedOrders.length})</span>
            {orderedOrders.some((o) => o.total > 0) && (
              <span className="font-display tabular-nums text-foreground">
                {formatPrice(
                  orderedOrders.reduce((sum, o) => sum + o.total, 0),
                )}
              </span>
            )}
          </h2>
          <StopList
            orders={orderedOrders}
            products={planner.activeProducts}
            deliverers={deliverers}
            currentUserId={userId}
            canCreate={canCreate}
            canDeliver={canDeliver}
            canManage={canManage}
            lockedOrderId={planner.lockedOrderId}
            onRemove={planner.removeOrder}
            onRename={planner.renameOrder}
            onDelivered={planner.markDelivered}
            onAssign={planner.assignOrder}
            onAddItem={planner.addItem}
            onRemoveItem={planner.removeItem}
            onGoTo={planner.goToOrder}
            onCancel={planner.cancelOrder}
          />
        </section>
      </aside>

      {showForm && (
        <OrderForm
          customers={planner.locatedCustomers}
          products={planner.activeProducts}
          deliverers={deliverers}
          submitting={submitting}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
