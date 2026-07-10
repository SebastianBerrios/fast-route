"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  rowToOrder,
  type NewOrderInput,
  type NewOrderItemInput,
  type Order,
} from "@/features/orders/domain/types";

export interface UseOrders {
  orders: Order[];
  loading: boolean;
  error: string | null;
  createOrder: (input: NewOrderInput) => Promise<void>;
  createOrderWithItems: (
    input: NewOrderInput,
    items: Omit<NewOrderItemInput, "orderId">[],
  ) => Promise<boolean>;
  renameOrder: (id: string, customerName: string) => Promise<void>;
  removeOrder: (id: string) => Promise<void>;
  markDelivered: (id: string) => Promise<void>;
  cancelOrder: (id: string) => Promise<void>;
  /** Assign the order to a driver, or free it up for anyone (null). */
  assignOrder: (id: string, driverId: string | null) => Promise<void>;
  addItem: (input: NewOrderItemInput) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  /** Set (or clear, with null) the order this driver is heading to. */
  setEnRoute: (orderId: string | null) => Promise<void>;
}

// Realtime topics must be unique per subscription: the singleton client
// reuses channels by topic, and re-subscribing a live one throws (see
// useProducts for the full story — StrictMode and double-mounting hit this).
let channelSeq = 0;

/**
 * Loads pending orders and keeps them in sync in real time via Supabase
 * Realtime. Any insert/update/delete (from any device) triggers a refetch,
 * so the route recomputes as orders come in.
 */
export function useOrders(userId: string): UseOrders {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One client instance for the lifetime of the hook.
  const [supabase] = useState(() => createClient());

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setOrders((data ?? []).map(rowToOrder));
      setError(null);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel(`orders-realtime-${++channelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => {
          fetchOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchOrders]);

  const createOrder = useCallback(
    async (input: NewOrderInput) => {
      if (!Number.isFinite(input.lng) || !Number.isFinite(input.lat)) {
        setError("Ubicación inválida para el pedido.");
        return;
      }
      const { error } = await supabase.from("orders").insert({
        created_by: userId,
        lng: input.lng,
        lat: input.lat,
        customer_name: input.customerName ?? null,
        note: input.note ?? null,
        customer_id: input.customerId ?? null,
        assigned_to: input.assignedTo ?? null,
      });
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, userId, fetchOrders],
  );

  const renameOrder = useCallback(
    async (id: string, customerName: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ customer_name: customerName })
        .eq("id", id);
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const removeOrder = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const markDelivered = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", id);
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const createOrderWithItems = useCallback(
    async (
      input: NewOrderInput,
      items: Omit<NewOrderItemInput, "orderId">[],
    ) => {
      if (!Number.isFinite(input.lng) || !Number.isFinite(input.lat)) {
        setError("Ubicación inválida para el pedido.");
        return false;
      }
      // One transactional RPC: the order and its items commit together, or
      // neither does — the old two-step insert could leave an orphan order
      // when the items insert failed. created_by is set server-side from the
      // session (auth.uid()), not trusted from the client.
      const { error } = await supabase.rpc("create_order_with_items", {
        p_lng: input.lng,
        p_lat: input.lat,
        p_customer_name: input.customerName ?? undefined,
        p_note: input.note ?? undefined,
        p_customer_id: input.customerId ?? undefined,
        p_assigned_to: input.assignedTo ?? undefined,
        p_items: items.map((it) => ({
          product_id: it.productId,
          product_name: it.productName,
          quantity: it.quantity,
          unit_price: it.unitPrice,
        })),
      });
      if (error) {
        setError(error.message);
        return false;
      }
      await fetchOrders();
      return true;
    },
    [supabase, fetchOrders],
  );

  const cancelOrder = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const assignOrder = useCallback(
    async (id: string, driverId: string | null) => {
      const { error } = await supabase
        .from("orders")
        .update({ assigned_to: driverId })
        .eq("id", id);
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const addItem = useCallback(
    async (input: NewOrderItemInput) => {
      const { error } = await supabase.from("order_items").insert({
        order_id: input.orderId,
        product_id: input.productId,
        product_name: input.productName,
        quantity: input.quantity,
        unit_price: input.unitPrice,
      });
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const { error } = await supabase
        .from("order_items")
        .delete()
        .eq("id", itemId);
      if (error) setError(error.message);
      else await fetchOrders();
    },
    [supabase, fetchOrders],
  );

  const setEnRoute = useCallback(
    async (orderId: string | null) => {
      // Only one order en-route per driver: clear the previous target first.
      await supabase
        .from("orders")
        .update({ en_route_by: null })
        .eq("en_route_by", userId)
        .eq("status", "pending");
      if (orderId) {
        const { error } = await supabase
          .from("orders")
          .update({ en_route_by: userId })
          .eq("id", orderId);
        if (error) setError(error.message);
      }
      await fetchOrders();
    },
    [supabase, userId, fetchOrders],
  );

  return {
    orders,
    loading,
    error,
    createOrder,
    createOrderWithItems,
    renameOrder,
    removeOrder,
    markDelivered,
    cancelOrder,
    assignOrder,
    addItem,
    removeItem,
    setEnRoute,
  };
}

