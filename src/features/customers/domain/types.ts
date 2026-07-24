import type { Database } from "@/lib/supabase/database.types";

/** A registered customer with an optional saved delivery location. */
export interface Customer {
  id: string;
  createdBy: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  lng: number | null;
  lat: number | null;
  createdAt: string;
}

/** Fields for creating or editing a customer (name required). */
export interface CustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
  lng?: number | null;
  lat?: number | null;
}

type CustomerRow = Database["fast_route"]["Tables"]["customers"]["Row"];

export function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    createdBy: row.created_by,
    name: row.name,
    phone: row.phone,
    address: row.address,
    note: row.note,
    lng: row.lng,
    lat: row.lat,
    createdAt: row.created_at,
  };
}

/** True when a customer has a usable delivery location for routing. */
export function hasLocation(
  c: Customer,
): c is Customer & { lng: number; lat: number } {
  return typeof c.lng === "number" && typeof c.lat === "number";
}
