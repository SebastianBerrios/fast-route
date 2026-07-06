"use client";

import { useState } from "react";
import { useProducts } from "@/features/products/hooks/useProducts";
import {
 formatPrice,
 isLowStock,
 STOCK_REASON_LABELS,
 type Product,
 type ProductInput,
 type StockReason,
} from "@/features/products/domain/types";

const inputClass =
"rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand bg-background";

type Editing = { mode: "new" } | { mode: "edit"; product: Product } | null;

function ProductForm({
 initial,
 submitting,
 onSubmit,
 onCancel,
}: {
 initial?: Product | null;
 submitting: boolean;
 onSubmit: (input: ProductInput) => void;
 onCancel: () => void;
}) {
 const [name, setName] = useState(initial?.name ?? "");
 const [unit, setUnit] = useState(initial?.unit ?? "");
 const [price, setPrice] = useState(initial ? String(initial.price) : "");
 const [minStock, setMinStock] = useState(
 initial ? String(initial.minStock) : "0",
 );
 const [initialStock, setInitialStock] = useState("0");
 const [isActive, setIsActive] = useState(initial?.isActive ?? true);

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!name.trim()) return;
 onSubmit({
 name: name.trim(),
 unit: unit.trim() || null,
 price: Number(price) || 0,
 minStock: Number(minStock) || 0,
 isActive,
 initialStock: initial ? undefined : Number(initialStock) || 0,
 });
 };

 return (
 <form onSubmit={handleSubmit} className="flex flex-col gap-3">
 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">Nombre *</span>
 <input
 className={inputClass}
 value={name}
 onChange={(e) => setName(e.target.value)}
 required
 />
 </label>

 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">Unidad</span>
 <input
 className={inputClass}
 value={unit}
 placeholder="Ej: bidón 20L"
 onChange={(e) => setUnit(e.target.value)}
 />
 </label>
 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">
 Precio (S/)
 </span>
 <input
 className={inputClass}
 type="number"
 min="0"
 step="0.01"
 value={price}
 onChange={(e) => setPrice(e.target.value)}
 />
 </label>
 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">
 Stock mínimo (alerta)
 </span>
 <input
 className={inputClass}
 type="number"
 min="0"
 step="1"
 value={minStock}
 onChange={(e) => setMinStock(e.target.value)}
 />
 </label>
 {!initial && (
 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">
 Stock inicial
 </span>
 <input
 className={inputClass}
 type="number"
 min="0"
 step="1"
 value={initialStock}
 onChange={(e) => setInitialStock(e.target.value)}
 />
 </label>
 )}
 </div>

 <label className="flex items-center gap-2 text-sm">
 <input
 type="checkbox"
 checked={isActive}
 onChange={(e) => setIsActive(e.target.checked)}
 />
 Activo (disponible para vender)
 </label>

 <div className="flex gap-2">
 <button
 type="submit"
 disabled={submitting || !name.trim()}
 className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
 >
 {submitting
 ? "Guardando…"
 : initial
 ? "Guardar cambios"
 : "Crear producto"}
 </button>
 <button
 type="button"
 onClick={onCancel}
 className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 Cancelar
 </button>
 </div>
 </form>
 );
}

function StockAdjust({
 onSubmit,
 onCancel,
}: {
 onSubmit: (delta: number, reason: StockReason, note: string) => void;
 onCancel: () => void;
}) {
 const [amount, setAmount] = useState("");
 const [reason, setReason] = useState<StockReason>("purchase");
 const [note, setNote] = useState("");

 const handle = () => {
 const value = Number(amount);
 if (!value) return;
 // Adjustments and sales reduce stock; purchases add.
 const delta = reason === "purchase" ? Math.abs(value) : value;
 onSubmit(delta, reason, note);
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
 disabled={!Number(amount)}
 className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
 >
 Aplicar
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

 {editing ? (
 <section className="rounded-xl border border-line bg-surface p-4">
 <h2 className="mb-3 font-semibold">
 {editing.mode === "edit" ? "Editar producto" : "Nuevo producto"}
 </h2>
 <ProductForm
 initial={editing.mode === "edit" ? editing.product : null}
 submitting={submitting}
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
 <p className="p-4 text-sm text-muted">Cargando productos…</p>
 ) : products.length === 0 ? (
 <p className="p-4 text-sm text-muted">
 Todavía no hay productos. Creá el primero.
 </p>
 ) : (
 <ul className="divide-y divide-line ">
 {products.map((product) => (
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
 if (confirm(`¿Eliminar ${product.name}?`)) {
 void removeProduct(product.id);
 }
 }}
 className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
 >
 ✕
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
 ))}
 </ul>
 )}
 </section>
 </div>
 );
}
