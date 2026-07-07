"use client";

import { useState } from "react";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import CustomerForm from "@/features/customers/components/CustomerForm";
import {
 hasLocation,
 type Customer,
 type CustomerInput,
} from "@/features/customers/domain/types";
import type { Coordinate } from "@/features/routing/domain/types";

type Editing = { mode: "new" } | { mode: "edit"; customer: Customer } | null;

export default function CustomersManager({
 userId,
 defaultCenter,
}: {
 userId: string;
 /** The tenant's stored region, used to center the picker and bias geocoding. */
 defaultCenter?: Coordinate;
}) {
 const {
 customers,
 loading,
 error,
 createCustomer,
 updateCustomer,
 removeCustomer,
 } = useCustomers(userId);
 const [editing, setEditing] = useState<Editing>(null);
 const [submitting, setSubmitting] = useState(false);

 const handleSubmit = async (input: CustomerInput) => {
 setSubmitting(true);
 const ok =
 editing?.mode === "edit"
 ? await updateCustomer(editing.customer.id, input)
 : await createCustomer(input);
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
 {editing.mode === "edit" ? "Editar cliente" : "Nuevo cliente"}
 </h2>
 <CustomerForm
 initial={editing.mode === "edit" ? editing.customer : null}
 submitting={submitting}
 defaultCenter={defaultCenter}
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
 + Nuevo cliente
 </button>
 )}

 <section className="rounded-xl border border-line ">
 {loading ? (
 <p className="p-4 text-sm text-muted">Cargando clientes…</p>
 ) : customers.length === 0 ? (
 <p className="p-4 text-sm text-muted">
 Todavía no hay clientes. Creá el primero.
 </p>
 ) : (
 <ul className="divide-y divide-line ">
 {customers.map((customer) => (
 <li
 key={customer.id}
 className="flex items-center gap-3 p-3 text-sm"
 >
 <div className="min-w-0 flex-1">
 <p className="font-medium">{customer.name}</p>
 <p className="truncate text-muted">
 {[customer.phone, customer.address]
 .filter(Boolean)
 .join(" · ") || "Sin datos de contacto"}
 </p>
 </div>
 <span
 className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
 hasLocation(customer)
 ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
 : "bg-neutral-100 text-muted dark:bg-neutral-800"
 }`}
 >
 {hasLocation(customer) ? "Con ubicación" : "Sin ubicación"}
 </span>
 <button
 type="button"
 onClick={() => setEditing({ mode: "edit", customer })}
 className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 "
 >
 Editar
 </button>
 <button
 type="button"
 onClick={() => {
 if (confirm(`¿Eliminar a ${customer.name}?`)) {
 void removeCustomer(customer.id);
 }
 }}
 className="shrink-0 rounded-md px-2 py-1 text-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
 >
 ✕
 </button>
 </li>
 ))}
 </ul>
 )}
 </section>
 </div>
 );
}
