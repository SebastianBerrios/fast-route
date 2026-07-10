"use client";

import { useState } from "react";
import type { Product, ProductInput } from "@/features/products/domain/types";

const inputClass =
  "rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand bg-background";

/** Standard unit options; the short value is what gets stored in the column. */
const UNIT_OPTIONS = [
  { value: "und", label: "Unidad (und)" },
  { value: "l", label: "Litro (l)" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "g", label: "Gramo (g)" },
  { value: "kg", label: "Kilogramo (kg)" },
] as const;

const STANDARD_UNIT_VALUES = new Set<string>(UNIT_OPTIONS.map((o) => o.value));

interface ProductFormProps {
  initial?: Product | null;
  submitting: boolean;
  /**
   * Products that own their stock pool (no stockSourceId), offered as
   * "share stock with" targets. The caller excludes the product being edited.
   */
  stockSourceCandidates?: { id: string; name: string }[];
  onSubmit: (input: ProductInput) => void;
  onCancel?: () => void;
}

export default function ProductForm({
  initial,
  submitting,
  stockSourceCandidates = [],
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial ? (initial.unit ?? "") : "und");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [minStock, setMinStock] = useState(
    initial ? String(initial.minStock) : "0",
  );
  const [initialStock, setInitialStock] = useState("0");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [stockSourceId, setStockSourceId] = useState(
    initial?.stockSourceId ?? "",
  );

  // The current link may point to a product outside the candidates list
  // (e.g. filtered out upstream); keep it selectable so editing never
  // silently unlinks.
  const hasStockSourceField =
    stockSourceCandidates.length > 0 || Boolean(initial?.stockSourceId);
  const linked = stockSourceId !== "";

  // Non-standard stored unit (legacy free-text data), kept selectable on edit.
  const legacyUnit =
    initial?.unit && !STANDARD_UNIT_VALUES.has(initial.unit)
      ? initial.unit
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      unit: unit || null,
      price: Number(price) || 0,
      // Linked products sell from the source's pool, so their own minStock
      // is inert — but keep the stored value so a link → unlink round-trip
      // does not wipe the alert threshold.
      minStock: Number(minStock) || 0,
      isActive,
      initialStock:
        initial || linked ? undefined : Number(initialStock) || 0,
      stockSourceId: stockSourceId || null,
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
          <select
            className={inputClass}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {/* The column is free text: legacy products may hold values
                outside the standard list (e.g. "bidón 20L") or no unit at
                all. Surface the stored value as an extra option so editing
                never silently rewrites it. */}
            {initial && !initial.unit && <option value="">Sin unidad</option>}
            {legacyUnit && <option value={legacyUnit}>{legacyUnit}</option>}
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted dark:text-muted">Precio (S/)</span>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        {!linked && (
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
        )}
        {!initial && !linked && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted dark:text-muted">Stock inicial</span>
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

      {hasStockSourceField && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted dark:text-muted">Stock</span>
          <select
            className={inputClass}
            value={stockSourceId}
            onChange={(e) => setStockSourceId(e.target.value)}
          >
            <option value="">Stock propio</option>
            {/* Keep the stored link selectable even if it fell out of the
                candidates list, so editing never silently unlinks. */}
            {initial?.stockSourceId &&
              !stockSourceCandidates.some(
                (c) => c.id === initial.stockSourceId,
              ) && (
                <option value={initial.stockSourceId}>
                  Comparte el stock de otro producto
                </option>
              )}
            {stockSourceCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                Comparte el stock de: {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            Usalo cuando dos productos venden el mismo ítem físico, como
            bidón y recarga: cada venta descuenta del stock del producto
            elegido.
          </span>
          {/* Unlinking resurrects the product's own (possibly stale) stock:
              make that visible before saving. */}
          {initial?.stockSourceId && !linked && (
            <span className="text-xs font-medium text-amber-700 dark:text-amber-500">
              Va a volver a usar su propio stock ({initial.stock}{" "}
              {initial.unit || "und"}). Ajustalo si no refleja la realidad.
            </span>
          )}
        </label>
      )}

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
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
