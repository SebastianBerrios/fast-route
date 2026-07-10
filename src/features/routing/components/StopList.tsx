"use client";

import { useState } from "react";
import type {
 NewOrderItemInput,
 Order,
} from "@/features/orders/domain/types";
import { formatPrice, type Product } from "@/features/products/domain/types";
import OrderItemsEditor from "@/features/orders/components/OrderItemsEditor";
import { usePendingActions } from "@/features/shell/ui/usePendingActions";
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
 onRemove: (id: string) => Promise<void>;
 onRename: (id: string, customerName: string) => Promise<void>;
 onDelivered: (id: string) => Promise<void>;
 onAssign: (id: string, driverId: string | null) => Promise<void>;
 onAddItem: (input: NewOrderItemInput) => Promise<void>;
 onRemoveItem: (itemId: string) => Promise<void>;
 onGoTo: (id: string) => Promise<void>;
 onCancel: (id: string) => Promise<void>;
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
 // Optimistic value for the assign <select> while the action is pending,
 // so the picked driver doesn't snap back to the old value.
 const [assignDraft, setAssignDraft] = useState<ReadonlyMap<string, string>>(
 new Map(),
 );
 const { run, isPending, hasPending } = usePendingActions();

 const clearAssignDraft = (orderId: string) =>
 setAssignDraft((prev) => {
 const next = new Map(prev);
 next.delete(orderId);
 return next;
 });

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
 // One in-flight action disables the whole row (conflicting buttons),
 // while other rows stay live.
 const rowBusy = hasPending(`${order.id}:`);
 return (
 <li
 key={order.id}
 aria-busy={rowBusy}
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
 // A row action already in flight wins — don't race it
 // with a rename fired by the blur.
 if (hasPending(`${order.id}:`)) return;
 const value = e.target.value.trim();
 if (value !== (order.customerName ?? "")) {
 // No visible swap for an inline input — just a re-entry
 // guard plus aria-busy on the row.
 void run(`${order.id}:rename`, () =>
 onRename(order.id, value),
 );
 }
 }}
 disabled={rowBusy}
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
 onClick={() => run(`${order.id}:goto`, () => onGoTo(order.id))}
 disabled={rowBusy}
 className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950"
 title="Marcar como próxima parada (no se reordena)"
 >
 {isPending(`${order.id}:goto`) ? "Marcando…" : "Voy a este"}
 </button>
 ))}
 {canDeliver && (
 <button
 type="button"
 onClick={() =>
 run(`${order.id}:deliver`, () => onDelivered(order.id))
 }
 disabled={rowBusy}
 className="shrink-0 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-green-50 hover:text-green-600 disabled:opacity-50 dark:hover:bg-green-950"
 aria-label={`Marcar pedido ${index + 1} como entregado`}
 title="Marcar como entregado"
 >
 {isPending(`${order.id}:deliver`) ? "…" : "✓"}
 </button>
 )}
 {canDelete && (
 <button
 type="button"
 onClick={() =>
 run(`${order.id}:remove`, () => onRemove(order.id))
 }
 disabled={rowBusy}
 className="shrink-0 rounded-md px-2 py-1 text-sm text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
 aria-label={`Eliminar pedido ${index + 1}`}
 title="Eliminar"
 >
 {isPending(`${order.id}:remove`) ? "…" : "✕"}
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
 value={assignDraft.get(order.id) ?? order.assignedTo ?? ""}
 onChange={(e) => {
 const value = e.target.value;
 setAssignDraft((prev) => new Map(prev).set(order.id, value));
 const settle = () => clearAssignDraft(order.id);
 run(`${order.id}:assign`, () =>
 onAssign(order.id, value || null),
 ).then(settle, settle);
 }}
 disabled={rowBusy}
 className="ml-auto rounded-md border border-line bg-background px-1.5 py-0.5 text-xs outline-none focus:border-brand disabled:opacity-50"
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
 onClick={() =>
 run(`${order.id}:assign`, () =>
 onAssign(order.id, currentUserId),
 )
 }
 disabled={rowBusy}
 className="ml-auto rounded-md px-2 py-0.5 font-medium text-brand transition-colors hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950"
 >
 {isPending(`${order.id}:assign`) ? "Tomando…" : "Tomar"}
 </button>
 ) : canDeliver && isMine ? (
 <button
 type="button"
 onClick={() =>
 run(`${order.id}:assign`, () => onAssign(order.id, null))
 }
 disabled={rowBusy}
 className="ml-auto rounded-md px-2 py-0.5 text-muted transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
 >
 {isPending(`${order.id}:assign`) ? "Liberando…" : "Liberar"}
 </button>
 ) : null}
 </div>

 {isOpen && (
 <div className="mt-2 flex flex-col gap-2">
 <OrderItemsEditor
 order={order}
 products={products}
 canEdit={canEdit}
 disabled={rowBusy}
 onAddItem={onAddItem}
 onRemoveItem={onRemoveItem}
 />
 {canDelete && (
 <button
 type="button"
 onClick={() =>
 run(`${order.id}:cancel`, () => onCancel(order.id))
 }
 disabled={rowBusy}
 className="self-start rounded-md px-2 py-1 text-xs text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
 >
 {isPending(`${order.id}:cancel`)
 ? "Cancelando…"
 : "Cancelar pedido"}
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
