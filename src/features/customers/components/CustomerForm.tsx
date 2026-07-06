"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Coordinate } from "@/features/routing/domain/types";
import type {
 Customer,
 CustomerInput,
} from "@/features/customers/domain/types";

const LocationPicker = dynamic(
 () => import("@/features/customers/components/LocationPicker"),
 {
 ssr: false,
 loading: () => (
 <div className="flex h-56 w-full items-center justify-center rounded-lg border border-line bg-neutral-100 text-sm text-muted">
 Cargando mapa…
 </div>
 ),
 },
);

interface GeoResult {
 label: string;
 lng: number;
 lat: number;
}

interface CustomerFormProps {
 initial?: Customer | null;
 submitting?: boolean;
 onSubmit: (input: CustomerInput) => void;
 onCancel?: () => void;
}

const inputClass =
"rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand bg-background";

export default function CustomerForm({
 initial,
 submitting,
 onSubmit,
 onCancel,
}: CustomerFormProps) {
 const [name, setName] = useState(initial?.name ?? "");
 const [phone, setPhone] = useState(initial?.phone ?? "");
 const [address, setAddress] = useState(initial?.address ?? "");
 const [note, setNote] = useState(initial?.note ?? "");
 const [location, setLocation] = useState<Coordinate | null>(
 initial && initial.lng != null && initial.lat != null
 ? { lng: initial.lng, lat: initial.lat }
 : null,
 );
 const [focus, setFocus] = useState<Coordinate | null>(null);

 const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
 const [geoStatus, setGeoStatus] = useState<
"idle" | "searching" | "empty" | "error"
 >("idle");

 const applyResult = (r: GeoResult) => {
 setLocation({ lng: r.lng, lat: r.lat });
 setFocus({ lng: r.lng, lat: r.lat });
 };

 const handleGeocode = async () => {
 const q = address.trim();
 if (!q) return;
 setGeoStatus("searching");
 setGeoResults([]);
 try {
 const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
 const data = await res.json();
 if (!res.ok) throw new Error(data?.error ?? "Error");
 const results = (data.results ?? []) as GeoResult[];
 if (results.length === 0) {
 setGeoStatus("empty");
 return;
 }
 setGeoResults(results);
 setGeoStatus("idle");
 applyResult(results[0]); // fly to the best match; user can refine below
 } catch {
 setGeoStatus("error");
 }
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 if (!name.trim()) return;
 onSubmit({
 name: name.trim(),
 phone: phone.trim() || null,
 address: address.trim() || null,
 note: note.trim() || null,
 lng: location?.lng ?? null,
 lat: location?.lat ?? null,
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

 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">Teléfono</span>
 <input
 className={inputClass}
 value={phone}
 onChange={(e) => setPhone(e.target.value)}
 />
 </label>

 {/* Address + geocoding */}
 <div className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">Dirección</span>
 <div className="flex gap-2">
 <input
 className={`${inputClass} flex-1`}
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
 className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
 >
 {geoStatus === "searching" ? "Buscando…" : "Ubicar"}
 </button>
 </div>
 {geoStatus === "empty" && (
 <p className="text-xs text-amber-600">
 No se encontró esa dirección. Probá con más detalle o marcá el punto
 en el mapa.
 </p>
 )}
 {geoStatus === "error" && (
 <p className="text-xs text-red-600">
 No se pudo buscar la dirección. Marcá el punto en el mapa.
 </p>
 )}
 {geoResults.length > 1 && (
 <ul className="flex flex-col gap-1 rounded-lg border border-line p-1 ">
 {geoResults.map((r, i) => (
 <li key={`${r.lat}-${r.lng}-${i}`}>
 <button
 type="button"
 onClick={() => {
 applyResult(r);
 setAddress(r.label);
 }}
 className="w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
 >
 {r.label}
 </button>
 </li>
 ))}
 </ul>
 )}
 </div>

 <label className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">Nota</span>
 <input
 className={inputClass}
 value={note}
 onChange={(e) => setNote(e.target.value)}
 />
 </label>

 <div className="flex flex-col gap-1 text-sm">
 <span className="text-muted dark:text-muted">
 Ubicación{" "}
 {location ? "(hacé clic para ajustar el pin)" : "(buscá arriba o hacé clic en el mapa)"}
 </span>
 <LocationPicker value={location} focus={focus} onChange={setLocation} />
 {location && (
 <p className="text-xs text-muted">
 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
 </p>
 )}
 </div>

 <div className="flex gap-2">
 <button
 type="submit"
 disabled={submitting || !name.trim()}
 className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
 >
 {submitting ? "Guardando…" : initial ? "Guardar cambios" : "Crear cliente"}
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
