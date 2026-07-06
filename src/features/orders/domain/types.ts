import type { Database } from "@/lib/supabase/database.types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** A single product line within an order. */
export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  /** Snapshot of the product name when the item was added. */
  productName: string;
  quantity: number;
  /** Snapshot of the product price when the item was added. */
  unitPrice: number;
}

/** A delivery order. Pending orders become stops in the optimized route. */
export interface Order {
  id: string;
  createdBy: string;
  customerName: string | null;
  note: string | null;
  lng: number;
  lat: number;
  status: OrderStatus;
  createdAt: string;
  /** Set when the order was delivered (i.e. it became a sale). */
  deliveredAt: string | null;
  deliveredBy: string | null;
  /** The driver currently heading to this order (locked as their next stop). */
  enRouteBy: string | null;
  /** Driver this order is assigned to; null = free for anyone to take. */
  assignedTo: string | null;
  items: OrderItem[];
  /** Sum of quantity * unitPrice across items. */
  total: number;
}

/** Fields needed to create a new order (location required, rest optional). */
export interface NewOrderInput {
  lng: number;
  lat: number;
  customerName?: string | null;
  note?: string | null;
  /** Set when the order is for a registered customer. */
  customerId?: string | null;
  /** Driver to assign the order to; null/undefined leaves it free. */
  assignedTo?: string | null;
}

/** Fields for adding a product line to an order. */
export interface NewOrderItemInput {
  orderId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
}

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

export function lineTotal(item: OrderItem): number {
  return item.quantity * item.unitPrice;
}

export function rowToOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
  };
}

/** Map a raw order row (optionally with embedded items) to the domain Order. */
export function rowToOrder(row: OrderRow & { order_items?: OrderItemRow[] }): Order {
  const items = (row.order_items ?? []).map(rowToOrderItem);
  return {
    id: row.id,
    createdBy: row.created_by,
    customerName: row.customer_name,
    note: row.note,
    lng: row.lng,
    lat: row.lat,
    status: row.status,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    deliveredBy: row.delivered_by,
    enRouteBy: row.en_route_by,
    assignedTo: row.assigned_to,
    items,
    total: items.reduce((sum, i) => sum + lineTotal(i), 0),
  };
}
