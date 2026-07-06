import type { Database } from "@/lib/supabase/database.types";

/** The role a user holds in the delivery business. */
export type UserRole = Database["public"]["Enums"]["user_role"];

/** Human-readable role labels for the UI (Spanish, matching the app). */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  driver: "Repartidor",
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}
