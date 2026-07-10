"use client";

import { useState } from "react";
import { useProducts } from "@/features/products/hooks/useProducts";
import ProductForm from "@/features/products/components/ProductForm";
import { usePendingActions } from "@/features/shell/ui/usePendingActions";
import { ListRowsSkeleton } from "@/features/shell/ui/Skeleton";
import {
 formatPrice,
 isLowStock,
 STOCK_REASON_LABELS,
 type Product,
 type ProductInput,
 type StockReason,
} from "@/features/products/domain/types";

type Editing = { mode: "new" } | { mode: "edit"; product: Product } | null;

function StockAdjust({
 onSubmit,
 onCancel,
}: {
 onSubmit: (delta: number, reason: StockReason, note: string) => Promise<void>;
 onCancel: () => void;
}) {
 const [amount, setAmount] = useState("");
 const [reason, setReason] = useState<StockReason>("purchase");
 const [note, setNote] = useState("");
 const [applying, setApplying] = useState(false);

 const handle = async () => {
 const value = Number(amount);
 if (!value || applying) return;
 // Adjustments and sales reduce stock; purchases add.
 const delta = reason === "purchase" ? Math.abs(value) : value;
 setApplying(true);
 try {
 await onSubmit(delta, reason, note);
 } finally {
 setApplying(false);
 }
 };

 return (
 <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2 ">
 <div className="flex flex-wrap items-center gap-2">
 <select
 value={reason}
 onChange={(e) => setReason(e.target.value as StockReason)}
 className="rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
 >
 <option value="purchase">{STOCK_REASON_LABELS.purchase}</option>
 <option value="adjustment">{STOCK_REASON_LABELS.adjustment}</option>
 </select>
 <input
 type="number"
 step="1"
 value={amount}
 placeholder={reason === "purchase" ? "Cantidad a sumar" : "±Cantidad"}
 onChange={(e) => setAmount(e.target.value)}
 className="w-32 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
 />
 <input
 type="text"
 value={note}
 placeholder="Nota (opcional)"
 onChange={(e) => setNote(e.target.value)}
 className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
 />
 <button
 type="button"
 onClick={handle}
 disabled={!Number(amount) || applying}
 className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
 >
 {applying ? "Aplicando…" : "Aplicar"}
 </button>
 <button
 type="button"
 onClick={onCancel}
 className="rounded-md px-2 py-1 text-xs text-muted hover:bg-black/5 dark:hover:bg-white/10"
 >
 Cancelar
 </button>
 </div>
 <p className="text-xs text-muted">
 Compra: suma stock. Ajuste: usá números negativos para descontar (merma,
 corrección).
 </p>
 </div>
 );
}

export default function ProductsManager({ userId }: { userId: string }) {
 const {
 products,
 loading,
 error,
 createProduct,
 updateProduct,
 removeProduct,
 adjustStock,
 } = useProducts(userId);
 const [editing, setEditing] = useState<Editing>(null);
 const [submitting, setSubmitting] = useState(false);
 const [adjustingId, setAdjustingId] = useState<string | null>(null);
 const [deleteError, setDeleteError] = useState<string | null>(null);
 const { run, isPending } = usePendingActions();

 const handleSubmit = async (input: ProductInput) => {
 setSubmitting(true);
 const ok =
 editing?.mode === "edit"
 ? await updateProduct(editing.product.id, input)
 : await createProduct(input);
 setSubmitting(false);
 if (ok) setEditing(null);
 };

 return (
 <div className="flex flex-col gap-4">
 {error && (
 <p className="text-sm text-red-600" role="alert">
 {error}
 </p>
 )}
 {deleteError && (
 <p className="text-sm text-red-600" role="alert">
 {deleteError}
 </p>
 )}

 {editing ? (
 <section className="rounded-xl border border-line bg-surface p-4">
 <h2 className="mb-3 font-semibold">
 {editing.mode === "edit" ? "Editar producto" : "Nuevo producto"}
 </h2>
 <ProductForm
 initial={editing.mode === "edit" ? editing.product : null}
 submitting={submitting}
 stockSourceCandidates={products
 .filter(
 (p) =>
 p.isActive &&
 !p.stockSourceId &&
 (editing.mode !== "edit" || p.id !== editing.product.id),
 )
 .map((p) => ({ id: p.id, name: p.name }))}
 onSubmit={handleSubmit}
 onCancel={() => setEditing(null)}
 />
 </section>
 ) : (
 <button
 type="button"
 onClick={() => setEditing({ mode: "new" })}
 className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
 >
 + Nuevo producto
 </button>
 )}

 <section className="rounded-xl border border-line ">
 {loading ? (
 <ListRowsSkeleton rows={4} label="Cargando productos…" />
 ) : products.length === 0 ? (
 <p className="p-4 text-sm text-muted">
 Todavía no hay productos. Creá el primero.
 </p>
 ) : (
 <ul className="divide-y divide-line ">
 {products.map((product) => {
 // Linked products sell from their source's pool: surface the
 // source's stock and leave alerts/adjustments to the owner.
 const stockSource = product.stockSourceId
 ? products.find((p) => p.id === product.stockSourceId)
 : undefined;
 return (
 <li key={product.id} className="p-3 text-sm">
 <div className="flex items-center gap-3">
 <div className="min-w-0 flex-1">
 <p className="font-medium">
 {product.name}
 {!product.isActive && (
 <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-muted dark:bg-neutral-800">
 Inactivo
 </span>
 )}
 </p>
 <p className="text-muted">
 {formatPrice(product.price)}
 {product.unit ? ` · ${product.unit}` : ""}
 </p>
 </div>
 {stockSource ? (
 <span
 className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400"
 title={`Comparte el stock de ${stockSource.name}`}
 >
 Stock: {stockSource.stock} · usa stock de{" "}
 {stockSource.name}
 </span>
 ) : (
 <span
 className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
 isLowStock(product)
 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
 : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
 }`}
 title={
 isLowStock(product) ? "Stock bajo o agotado" : "En stock"
 }
 >
 Stock: {product.stock}
 {isLowStock(product) ? " ⚠️" : ""}
 </span>
 )}
 {!product.stockSourceId && (
 <button
 type="button"
 onClick={() =>
 setAdjustingId(
 adjustingId === product.id ? null : product.id,
 )
 }
 className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 "
 >
 Ajustar
 </button>
 )}
 <button
 type="button"
 onClick={() => setEditing({ mode: "edit", product })}
 className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 "
 >
 Editar
 </button>
 <button
 type="button"
 onClick={() => {
 // Deleting a pool owner would leave dependents on their
 // stale own stock. The DB blocks it too; catch it here
 // with a clearer message.
 const dependents = products.filter(
 (p) => p.stockSourceId === product.id,
 );
 if (dependents.length > 0) {
 const names = dependents
 .map((d) => d.name)
 .join(", ");
 setDeleteError(
 dependents.length === 1
 ? `${names} comparte su stock. Desvinculalo antes de eliminarlo.`
 : `${names} comparten su stock. Desvinculalos antes de eliminarlo.`,
 );
 return;
 }
 setDeleteError(null);
 if (confirm(`¿Eliminar ${product.name}?`)) {
 void run(`remove:${product.id}`, () =>
 removeProduct(product.id),
 );
 }
 }}
 disabled={isPending(`remove:${product.id}`)}
 className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
 >
 {isPending(`remove:${product.id}`) ? "…" : "✕"}
 </button>
 </div>

 {adjustingId === product.id && (
 <StockAdjust
 onSubmit={async (delta, reason, note) => {
 const ok = await adjustStock(
 product.id,
 delta,
 reason,
 note,
 );
 if (ok) setAdjustingId(null);
 }}
 onCancel={() => setAdjustingId(null)}
 />
 )}
 </li>
 );
 })}
 </ul>
 )}
 </section>
 </div>
 );
}
