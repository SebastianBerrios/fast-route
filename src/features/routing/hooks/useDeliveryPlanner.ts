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
  NewOrderItemInput,
  Order,
} from "@/features/orders/domain/types";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import { hasLocation, type Customer } from "@/features/customers/domain/types";
import { useProducts } from "@/features/products/hooks/useProducts";
import type { Product } from "@/features/products/domain/types";

export type PlannerMode = "driver" | "stop";
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
  driver: Coordinate | null;
  mode: PlannerMode;
  returnToStart: boolean;
  orderedOrders: Order[];
  orderedStops: Stop[];
  route: OptimizedRoute | null;
  optimizeStatus: OptimizeStatus;
  optimizeError: string | null;
  ordersLoading: boolean;
  ordersError: string | null;
  /** Registered customers that have a saved location (usable for orders). */
  locatedCustomers: Customer[];
  /** Active catalog products, for adding line items to orders. */
  activeProducts: Product[];
  /** The order locked as "en route" (fixed first stop), or null. */
  lockedOrderId: string | null;
  handleMapClick: (coord: Coordinate) => void;
  addOrderForCustomer: (customerId: string) => void;
  setMode: (mode: PlannerMode) => void;
  setReturnToStart: (value: boolean) => void;
  clearDriver: () => void;
  removeOrder: (id: string) => void;
  renameOrder: (id: string, customerName: string) => void;
  markDelivered: (id: string) => void;
  addItem: (input: NewOrderItemInput) => void;
  removeItem: (itemId: string) => void;
  /** Mark an order as the driver's current target (locks it first). */
  goToOrder: (id: string) => void;
  /** Clear the lock and re-optimize the whole route from scratch. */
  optimizeRoute: () => void;
}

export function useDeliveryPlanner(
  userId: string,
  canCreateOrders: boolean,
): DeliveryPlanner {
  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    createOrder,
    renameOrder,
    removeOrder,
    markDelivered,
    addItem,
    removeItem,
    setEnRoute,
  } = useOrders(userId);

  // The order this driver is currently heading to (locked as the first stop).
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
  const [mode, setMode] = useState<PlannerMode>("driver");
  const [returnToStart, setReturnToStart] = useState(true);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [optimizeStatus, setOptimizeStatus] = useState<OptimizeStatus>("idle");
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  // Content signature so the optimize effect only reruns on real changes,
  // not on every realtime refetch that returns identical data.
  const stopsSignature = useMemo(
    () =>
      orders
        .map((o) => `${o.id}:${o.lng.toFixed(6)}:${o.lat.toFixed(6)}`)
        .join("|"),
    [orders],
  );

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const handleMapClick = useCallback(
    (coord: Coordinate) => {
      // Users who can't create orders only ever set the driver location.
      if (!canCreateOrders || mode === "driver" || !driver) {
        setDriver(coord);
        if (canCreateOrders) setMode("stop");
      } else {
        void createOrder({ lng: coord.lng, lat: coord.lat });
      }
    },
    [mode, driver, createOrder, canCreateOrders],
  );

  const addOrderForCustomer = useCallback(
    (customerId: string) => {
      const customer = locatedCustomers.find((c) => c.id === customerId);
      if (!customer || customer.lng == null || customer.lat == null) return;
      void createOrder({
        lng: customer.lng,
        lat: customer.lat,
        customerName: customer.name,
        customerId: customer.id,
      });
    },
    [locatedCustomers, createOrder],
  );

  const clearDriver = useCallback(() => {
    setDriver(null);
    setRoute(null);
    setMode("driver");
  }, []);

  // Recompute the optimal route whenever the stops, driver, or return
  // preference change. Debounced so a burst of new orders yields one request.
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

      // Locked order is fixed first; the rest optimize from there.
      // The server draws the real road leg driver→locked and composes it.
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

  // Orders sorted by the optimized visiting order (insertion order until solved).
  const orderedOrders = useMemo(() => {
    if (!route) return orders;
    const byId = new Map(orders.map((o) => [o.id, o]));
    const ordered = route.order
      .map((id) => byId.get(id))
      .filter((o): o is Order => Boolean(o));
    const seen = new Set(route.order);
    const rest = orders.filter((o) => !seen.has(o.id));
    return [...ordered, ...rest];
  }, [route, orders]);

  const orderedStops = useMemo(
    () => orderedOrders.map(orderToStop),
    [orderedOrders],
  );

  return {
    driver,
    mode,
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
    handleMapClick,
    addOrderForCustomer,
    setMode,
    setReturnToStart,
    clearDriver,
    removeOrder: (id) => void removeOrder(id),
    renameOrder: (id, name) => void renameOrder(id, name),
    markDelivered: (id) => void markDelivered(id),
    addItem: (input) => void addItem(input),
    removeItem: (itemId) => void removeItem(itemId),
    goToOrder: (id) => void setEnRoute(id),
    optimizeRoute: () => void setEnRoute(null),
  };
}
