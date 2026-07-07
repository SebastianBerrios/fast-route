"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Coordinate } from "@/features/routing/domain/types";
import { DEFAULT_MAP_CENTER } from "@/features/routing/domain/constants";
import type { Customer } from "@/features/customers/domain/types";
import { formatPrice, type Product } from "@/features/products/domain/types";
import type {
  NewOrderInput,
  NewOrderItemInput,
} from "@/features/orders/domain/types";
import type { Deliverer } from "@/features/orders/hooks/useDeliverers";

const LocationPicker = dynamic(
  () => import("@/features/customers/components/LocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 w-full items-center justify-center rounded-lg border border-line text-sm text-muted">
        Cargando mapa…
      </div>
    ),
  },
);

type Item = Omit<NewOrderItemInput, "orderId">;
interface GeoResult {
  label: string;
  lng: number;
  lat: number;
}

interface OrderFormProps {
  customers: Customer[];
  products: Product[];
  deliverers: Deliverer[];
  submitting?: boolean;
  /** Map center used to bias geocoding and open the picker (tenant's region). */
  defaultCenter?: Coordinate;
  onSubmit: (input: NewOrderInput, items: Item[]) => void;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-brand";

export default function OrderForm({
  customers,
  products,
  deliverers,
  submitting,
  defaultCenter = DEFAULT_MAP_CENTER,
  onSubmit,
  onClose,
}: OrderFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [focus, setFocus] = useState<Coordinate | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "searching" | "empty" | "error"
  >("idle");
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);

  const [items, setItems] = useState<Item[]>([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");

  const registered = customerId !== "";

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    if (!id) return;
    const c = customers.find((x) => x.id === id);
    if (c) {
      setName(c.name);
      if (c.lng != null && c.lat != null) {
        const coord = { lng: c.lng, lat: c.lat };
        setLocation(coord);
        setFocus({ ...coord });
      }
    }
  };

  const handleGeocode = async () => {
    const q = address.trim();
    if (!q) return;
    setGeoStatus("searching");
    setGeoResults([]);
    // Bias results toward the current pin, or the tenant's region if none yet.
    const bias = location ?? defaultCenter;
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(q)}&lng=${bias.lng}&lat=${bias.lat}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      const results = (data.results ?? []) as GeoResult[];
      if (results.length === 0) {
        setGeoStatus("empty");
        return;
      }
      setGeoResults(results);
      setGeoStatus("idle");
      setLocation({ lng: results[0].lng, lat: results[0].lat });
      setFocus({ lng: results[0].lng, lat: results[0].lat });
    } catch {
      setGeoStatus("error");
    }
  };

  const addItem = () => {
    const p = products.find((x) => x.id === productId);
    const q = Number(qty);
    if (!p || !(q > 0)) return;
    setItems((prev) => [
      ...prev,
      { productId: p.id, productName: p.name, quantity: q, unitPrice: p.price },
    ]);
    setProductId("");
    setQty("1");
  };

  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const canSubmit = !!location && (registered || name.trim().length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !location) return;
    onSubmit(
      {
        lng: location.lng,
        lat: location.lat,
        customerName: name.trim() || null,
        note: note.trim() || null,
        customerId: customerId || null,
        assignedTo: assignedTo || null,
      },
      items,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display text-lg font-bold">Nuevo pedido</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-muted hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <form
          onSubmit={submit}
          className="flex flex-col gap-3 overflow-y-auto p-4"
        >
          {/* Customer */}
          {customers.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Cliente</span>
              <select
                value={customerId}
                onChange={(e) => pickCustomer(e.target.value)}
                className={inputClass}
              >
                <option value="">— Cliente nuevo / sin registrar —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              {registered ? "Cliente" : "Nombre del cliente *"}
            </span>
            <input
              className={inputClass}
              value={name}
              readOnly={registered}
              placeholder="Ej: Kiosco Don Pepe"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {/* Address search (ad-hoc) */}
          {!registered && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Dirección</span>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={address}
                  placeholder="Ej: Av. Bolognesi 123, Tacna"
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGeocode();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={geoStatus === "searching" || !address.trim()}
                  className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {geoStatus === "searching" ? "Buscando…" : "Ubicar"}
                </button>
              </div>
              {geoStatus === "empty" && (
                <p className="text-xs text-amber-600">
                  No se encontró. Ajustá el pin en el mapa.
                </p>
              )}
              {geoResults.length > 1 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-line p-1">
                  {geoResults.map((r, i) => (
                    <li key={`${r.lat}-${r.lng}-${i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setLocation({ lng: r.lng, lat: r.lat });
                          setFocus({ lng: r.lng, lat: r.lat });
                          setAddress(r.label);
                        }}
                        className="w-full rounded px-2 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Map */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              Ubicación en el mapa {location ? "(tocá para ajustar)" : "*"}
            </span>
            <LocationPicker
              value={location}
              focus={focus}
              defaultCenter={defaultCenter}
              onChange={setLocation}
            />
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Nota (opcional)</span>
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {/* Assignment */}
          {deliverers.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Asignar a</span>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={inputClass}
              >
                <option value="">🟢 Libre — cualquier repartidor lo toma</option>
                {deliverers.map((d) => (
                  <option key={d.id} value={d.id}>
                    👤 {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Products */}
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <span className="text-sm font-medium">Productos</span>
            {items.length > 0 && (
              <ul className="flex flex-col gap-1">
                {items.map((it, i) => (
                  <li
                    key={`${it.productId}-${i}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="flex-1 truncate">
                      {it.quantity} × {it.productName}
                    </span>
                    <span className="tabular-nums">
                      {formatPrice(it.quantity * it.unitPrice)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-neutral-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {products.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-line bg-background px-2 py-1 text-xs outline-none focus:border-brand"
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
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-14 rounded-md border border-line bg-background px-2 py-1 text-xs outline-none focus:border-brand"
                  aria-label="Cantidad"
                />
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!productId}
                  className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-40"
                >
                  Agregar
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">
                No hay productos en el catálogo todavía.
              </p>
            )}
            {total > 0 && (
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {submitting ? "Guardando…" : "Crear pedido"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
          {!location && (
            <p className="text-xs text-amber-600">
              Marcá la ubicación de entrega en el mapa para poder guardar.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
