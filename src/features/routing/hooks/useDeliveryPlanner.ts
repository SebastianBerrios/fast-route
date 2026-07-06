"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Coordinate,
  OptimizedRoute,
  Stop,
  Vehicle,
} from "@/features/routing/domain/types";
import { useOrders } from "@/features/orders/hooks/useOrders";
import type {
  NewOrderInput,
  NewOrderItemInput,
  Order,
} from "@/features/orders/domain/types";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import { hasLocation, type Customer } from "@/features/customers/domain/types";
import { useProducts } from "@/features/products/hooks/useProducts";
import type { Product } from "@/features/products/domain/types";
import { useLiveLocation } from "@/features/tracking/hooks/useLiveLocation";
import {
  useTenantDrivers,
  type LiveDriver,
} from "@/features/tracking/hooks/useTenantDrivers";

export type OptimizeStatus = "idle" | "optimizing" | "error";

const DEBOUNCE_MS = 600;

/** Map a persisted order to a transport-agnostic routing Stop. */
function orderToStop(order: Order): Stop {
  return {
    id: order.id,
    coordinate: { lng: order.lng, lat: order.lat },
    label: order.customerName || "Pedido",
    customerName: order.customerName ?? undefined,
  };
}

export interface DeliveryPlanner {
  /** The current user's position (from GPS), used as the route start. */
  driver: Coordinate | null;
  returnToStart: boolean;
  orderedOrders: Order[];
  orderedStops: Stop[];
  route: OptimizedRoute | null;
  optimizeStatus: OptimizeStatus;
  optimizeError: string | null;
  ordersLoading: boolean;
  ordersError: string | null;
  /** Registered customers that have a saved location. */
  locatedCustomers: Customer[];
  /** Active catalog products. */
  activeProducts: Product[];
  /** The order locked as "en route" (fixed first stop), or null. */
  lockedOrderId: string | null;
  liveShare: boolean;
  liveError: string | null;
  otherDrivers: LiveDriver[];
  toggleLiveShare: () => void;
  /** Refresh the user's GPS position (one-shot). */
  locateMe: () => void;
  setReturnToStart: (value: boolean) => void;
  createOrderWithItems: (
    input: NewOrderInput,
    items: Omit<NewOrderItemInput, "orderId">[],
  ) => Promise<boolean>;
  removeOrder: (id: string) => void;
  renameOrder: (id: string, customerName: string) => void;
  markDelivered: (id: string) => void;
  cancelOrder: (id: string) => void;
  /** Assign an order to a driver, or free it up for anyone (null). */
  assignOrder: (id: string, driverId: string | null) => void;
  addItem: (input: NewOrderItemInput) => void;
  removeItem: (itemId: string) => void;
  goToOrder: (id: string) => void;
  optimizeRoute: () => void;
}

export function useDeliveryPlanner(userId: string): DeliveryPlanner {
  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    createOrderWithItems,
    renameOrder,
    removeOrder,
    markDelivered,
    cancelOrder,
    assignOrder,
    addItem,
    removeItem,
    setEnRoute,
  } = useOrders(userId);

  // Orders this user routes: assigned to them, or free for anyone to take.
  // Orders assigned to another driver are excluded from the map and route.
  const routableOrders = useMemo(
    () => orders.filter((o) => o.assignedTo === null || o.assignedTo === userId),
    [orders, userId],
  );

  const lockedOrderId = useMemo(
    () => orders.find((o) => o.enRouteBy === userId)?.id ?? null,
    [orders, userId],
  );

  const { customers } = useCustomers(userId);
  const locatedCustomers = useMemo(
    () => customers.filter(hasLocation),
    [customers],
  );

  const { products } = useProducts(userId);
  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products],
  );

  const [driver, setDriver] = useState<Coordinate | null>(null);
  const [returnToStart, setReturnToStart] = useState(true);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [optimizeStatus, setOptimizeStatus] = useState<OptimizeStatus>("idle");
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  const {
    sharing: liveShare,
    coord: liveCoord,
    error: liveError,
    toggle: toggleLiveShare,
    locateOnce,
  } = useLiveLocation(userId);
  const otherDrivers = useTenantDrivers(userId);

  // Ask for the user's position once on mount; the driver start follows GPS.
  useEffect(() => {
    locateOnce();
  }, [locateOnce]);

  useEffect(() => {
    if (liveCoord) setDriver(liveCoord);
  }, [liveCoord]);

  const stopsSignature = useMemo(
    () =>
      routableOrders
        .map((o) => `${o.id}:${o.lng.toFixed(6)}:${o.lat.toFixed(6)}`)
        .join("|"),
    [routableOrders],
  );

  const ordersRef = useRef(routableOrders);
  ordersRef.current = routableOrders;

  // Recompute the optimal route when stops, driver or return preference change.
  useEffect(() => {
    if (!driver || ordersRef.current.length === 0) {
      setRoute(null);
      setOptimizeStatus("idle");
      setOptimizeError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setOptimizeStatus("optimizing");
      setOptimizeError(null);

      const current = ordersRef.current;
      const locked = lockedOrderId
        ? (current.find((o) => o.id === lockedOrderId) ?? null)
        : null;

      const restStops = current
        .filter((o) => o.id !== locked?.id)
        .map(orderToStop);

      const vehicle: Vehicle = {
        id: "driver",
        start: driver,
        ...(returnToStart ? { end: driver } : {}),
      };
      const body = {
        vehicle,
        stops: restStops,
        ...(locked
          ? {
              locked: {
                id: locked.id,
                coordinate: { lng: locked.lng, lat: locked.lat },
              },
            }
          : {}),
      };

      try {
        const res = await fetch("/api/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to optimize route.");
        setRoute(data as OptimizedRoute);
        setOptimizeStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        setRoute(null);
        setOptimizeStatus("error");
        setOptimizeError(
          err instanceof Error ? err.message : "Unexpected error.",
        );
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [stopsSignature, driver, returnToStart, lockedOrderId]);

  // Routable orders in route order (these are the numbered map stops).
  const orderedRoutable = useMemo(() => {
    if (!route) return routableOrders;
    const byId = new Map(routableOrders.map((o) => [o.id, o]));
    const ordered = route.order
      .map((id) => byId.get(id))
      .filter((o): o is Order => Boolean(o));
    const seen = new Set(route.order);
    const rest = routableOrders.filter((o) => !seen.has(o.id));
    return [...ordered, ...rest];
  }, [route, routableOrders]);

  // Full list for the panel: routable first, then orders assigned to others.
  const orderedOrders = useMemo(() => {
    const others = orders.filter(
      (o) => o.assignedTo !== null && o.assignedTo !== userId,
    );
    return [...orderedRoutable, ...others];
  }, [orderedRoutable, orders, userId]);

  const orderedStops = useMemo(
    () => orderedRoutable.map(orderToStop),
    [orderedRoutable],
  );

  return {
    driver,
    returnToStart,
    orderedOrders,
    orderedStops,
    route,
    optimizeStatus,
    optimizeError,
    ordersLoading,
    ordersError,
    locatedCustomers,
    activeProducts,
    lockedOrderId,
    liveShare,
    liveError,
    otherDrivers,
    toggleLiveShare,
    locateMe: locateOnce,
    setReturnToStart,
    createOrderWithItems,
    removeOrder: (id) => void removeOrder(id),
    renameOrder: (id, name) => void renameOrder(id, name),
    markDelivered: (id) => void markDelivered(id),
    cancelOrder: (id) => void cancelOrder(id),
    assignOrder: (id, driverId) => void assignOrder(id, driverId),
    addItem: (input) => void addItem(input),
    removeItem: (itemId) => void removeItem(itemId),
    goToOrder: (id) => void setEnRoute(id),
    optimizeRoute: () => void setEnRoute(null),
  };
}
