"use client";

import { useState } from "react";
import type {
 NewOrderItemInput,
 Order,
} from "@/features/orders/domain/types";
import { formatPrice, type Product } from "@/features/products/domain/types";
import OrderItemsEditor from "@/features/orders/components/OrderItemsEditor";
import type { Deliverer } from "@/features/orders/hooks/useDeliverers";

interface StopListProps {
 orders: Order[];
 products: Product[];
 deliverers: Deliverer[];
 currentUserId: string;
 canCreate: boolean;
 canDeliver: boolean;
 canManage: boolean;
 lockedOrderId: string | null;
 onRemove: (id: string) => void;
 onRename: (id: string, customerName: string) => void;
 onDelivered: (id: string) => void;
 onAssign: (id: string, driverId: string | null) => void;
 onAddItem: (input: NewOrderItemInput) => void;
 onRemoveItem: (itemId: string) => void;
 onGoTo: (id: string) => void;
 onCancel: (id: string) => void;
}

export default function StopList({
 orders,
 products,
 deliverers,
 currentUserId,
 canCreate,
 canDeliver,
 canManage,
 lockedOrderId,
 onRemove,
 onRename,
 onDelivered,
 onAssign,
 onAddItem,
 onRemoveItem,
 onGoTo,
 onCancel,
}: StopListProps) {
 const [expanded, setExpanded] = useState<Set<string>>(new Set());

 const toggle = (id: string) =>
 setExpanded((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });

 if (orders.length === 0) {
 return (
 <p className="text-sm text-muted">
 Todavía no hay pedidos pendientes.
 </p>
 );
 }

 return (
 <ol className="flex flex-col gap-2">
 {orders.map((order, index) => {
 const isOpen = expanded.has(order.id);
 const isOwner = order.createdBy === currentUserId;
 const canEdit = canManage || (isOwner && canCreate);
 const canDelete = canManage || isOwner;
 const isLocked = order.id === lockedOrderId;
 const isFree = order.assignedTo === null;
 const isMine = order.assignedTo === currentUserId;
 const assignedName =
 deliverers.find((d) => d.id === order.assignedTo)?.name ??
 "otro repartidor";
 return (
 <li
 key={order.id}
 className={`rounded-lg border bg-surface p-2 ${
 isLocked
 ? "border-blue-500 ring-1 ring-blue-500"
 : "border-line "
 }`}
 >
 <div className="flex items-center gap-2">
 <span
 className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
 isLocked ? "bg-brand" : "bg-orange-600"
 }`}
 >
 {isLocked ? "🚚" : index + 1}
 </span>
 {canEdit ? (
 <input
 className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
 defaultValue={order.customerName ?? ""}
 placeholder={`Cliente / pedido ${index + 1}`}
 onBlur={(e) => {
 const value = e.target.value.trim();
 if (value !== (order.customerName ?? "")) {
 onRename(order.id, value);
 }
 }}
 aria-label={`Nombre del cliente para el pedido ${index + 1}`}
 />
 ) : (
 <span className="min-w-0 flex-1 truncate text-sm">
 {order.customerName || `Pedido ${index + 1}`}
 </span>
 )}
 <button
 type="button"
 onClick={() => toggle(order.id)}
 className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 aria-expanded={isOpen}
 >
 {order.total > 0 ? (
 <span className="font-medium tabular-nums">
 {formatPrice(order.total)}
 </span>
 ) : (
 <span>Productos</span>
 )}
 <span>{isOpen ? "▲" : "▼"}</span>
 </button>
 {canDeliver &&
 (isLocked ? (
 <span className="shrink-0 rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
 En camino
 </span>
 ) : (
 <button
 type="button"
 onClick={() => onGoTo(order.id)}
 className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-blue-50 dark:hover:bg-blue-950"
 title="Marcar como próxima parada (no se reordena)"
 >
 Voy a este
 </button>
 ))}
 {canDeliver && (
 <button
 type="button"
 onClick={() => onDelivered(order.id)}
 className="shrink-0 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950"
 aria-label={`Marcar pedido ${index + 1} como entregado`}
 title="Marcar como entregado"
 >
 ✓
 </button>
 )}
 {canDelete && (
 <button
 type="button"
 onClick={() => onRemove(order.id)}
 className="shrink-0 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
 aria-label={`Eliminar pedido ${index + 1}`}
 title="Eliminar"
 >
 ✕
 </button>
 )}
 </div>

 {/* Assignment: distinguish free vs assigned, allow take/reassign */}
 <div className="mt-1.5 flex items-center gap-2 pl-9 text-xs">
 {isFree ? (
 <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
 🟢 Libre
 </span>
 ) : (
 <span
 className={`rounded-full px-2 py-0.5 font-medium ${
 isMine
 ? "bg-brand/15 text-brand"
 : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
 }`}
 >
 👤 {isMine ? "Asignado a vos" : `Asignado a ${assignedName}`}
 </span>
 )}
 {canEdit ? (
 <select
 value={order.assignedTo ?? ""}
 onChange={(e) => onAssign(order.id, e.target.value || null)}
 className="ml-auto rounded-md border border-line bg-background px-1.5 py-0.5 text-xs outline-none focus:border-brand"
 aria-label="Asignar repartidor"
 >
 <option value="">Libre</option>
 {deliverers.map((d) => (
 <option key={d.id} value={d.id}>
 {d.name}
 </option>
 ))}
 </select>
 ) : canDeliver && isFree ? (
 <button
 type="button"
 onClick={() => onAssign(order.id, currentUserId)}
 className="ml-auto rounded-md px-2 py-0.5 font-medium text-brand transition-colors hover:bg-blue-50 dark:hover:bg-blue-950"
 >
 Tomar
 </button>
 ) : canDeliver && isMine ? (
 <button
 type="button"
 onClick={() => onAssign(order.id, null)}
 className="ml-auto rounded-md px-2 py-0.5 text-muted transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 Liberar
 </button>
 ) : null}
 </div>

 {isOpen && (
 <div className="mt-2 flex flex-col gap-2">
 <OrderItemsEditor
 order={order}
 products={products}
 canEdit={canEdit}
 onAddItem={onAddItem}
 onRemoveItem={onRemoveItem}
 />
 {canDelete && (
 <button
 type="button"
 onClick={() => onCancel(order.id)}
 className="self-start rounded-md px-2 py-1 text-xs text-amber-600 transition-colors hover:bg-amber-500/10"
 >
 Cancelar pedido
 </button>
 )}
 </div>
 )}
 </li>
 );
 })}
 </ol>
 );
}
