"use client";

import { useState } from "react";
import {
 lineTotal,
 type NewOrderItemInput,
 type Order,
} from "@/features/orders/domain/types";
import { formatPrice, type Product } from "@/features/products/domain/types";
import { usePendingActions } from "@/features/shell/ui/usePendingActions";

interface OrderItemsEditorProps {
 order: Order;
 products: Product[];
 canEdit: boolean;
 /** Disables mutating controls while the parent row has an action pending. */
 disabled?: boolean;
 onAddItem: (input: NewOrderItemInput) => Promise<void>;
 onRemoveItem: (itemId: string) => Promise<void>;
}

export default function OrderItemsEditor({
 order,
 products,
 canEdit,
 disabled = false,
 onAddItem,
 onRemoveItem,
}: OrderItemsEditorProps) {
 const [productId, setProductId] = useState("");
 const [quantity, setQuantity] = useState("1");
 const { run, isPending } = usePendingActions();
 const adding = isPending(`additem:${order.id}`);

 const handleAdd = () => {
 const product = products.find((p) => p.id === productId);
 const qty = Number(quantity);
 if (!product || !(qty > 0)) return;
 void run(`additem:${order.id}`, async () => {
 await onAddItem({
 orderId: order.id,
 productId: product.id,
 productName: product.name,
 quantity: qty,
 unitPrice: product.price,
 });
 setProductId("");
 setQuantity("1");
 });
 };

 return (
 <div className="flex flex-col gap-2 border-t border-line pt-2 ">
 {order.items.length > 0 ? (
 <ul className="flex flex-col gap-1">
 {order.items.map((item) => (
 <li
 key={item.id}
 className="flex items-center gap-2 text-xs text-muted dark:text-muted"
 >
 <span className="flex-1 truncate">
 {item.quantity} × {item.productName}
 </span>
 <span className="tabular-nums">{formatPrice(lineTotal(item))}</span>
 {canEdit && (
 <button
 type="button"
 onClick={() =>
 run(`item:${item.id}`, () => onRemoveItem(item.id))
 }
 disabled={disabled || isPending(`item:${item.id}`)}
 className="rounded px-1 text-muted transition-colors hover:text-red-600 disabled:opacity-50"
 aria-label={`Quitar ${item.productName}`}
 >
 {isPending(`item:${item.id}`) ? "…" : "✕"}
 </button>
 )}
 </li>
 ))}
 </ul>
 ) : (
 <p className="text-xs text-muted">Sin productos.</p>
 )}

 {canEdit &&
 (products.length > 0 ? (
 <div className="flex items-center gap-2">
 <select
 value={productId}
 onChange={(e) => setProductId(e.target.value)}
 className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
 >
 <option value="">Producto…</option>
 {products.map((p) => (
 <option key={p.id} value={p.id}>
 {p.name} ({formatPrice(p.price)})
 </option>
 ))}
 </select>
 <input
 type="number"
 min="1"
 step="1"
 value={quantity}
 onChange={(e) => setQuantity(e.target.value)}
 className="w-14 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
 aria-label="Cantidad"
 />
 <button
 type="button"
 onClick={handleAdd}
 disabled={disabled || !productId || adding}
 className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
 >
 {adding ? "Agregando…" : "Agregar"}
 </button>
 </div>
 ) : (
 <p className="text-xs text-muted">
 No hay productos en el catálogo todavía.
 </p>
 ))}

 <div className="flex justify-between text-xs font-semibold">
 <span>Total</span>
 <span className="tabular-nums">{formatPrice(order.total)}</span>
 </div>
 </div>
 );
}
