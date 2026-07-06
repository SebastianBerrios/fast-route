import type { UserRole } from "@/features/auth/domain/roles";

/** Every granular action a user can be granted. Keep in sync with the SQL
 *  `private.default_permissions` function. */
export const PERMISSIONS = [
  "orders.create",
  "orders.deliver",
  "orders.manage",
  "customers.manage",
  "products.manage",
  "sales.view",
  "metrics.view",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "orders.create": "Registrar pedidos",
  "orders.deliver": "Registrar entregas",
  "orders.manage": "Administrar pedidos (editar/eliminar)",
  "customers.manage": "Gestionar clientes",
  "products.manage": "Gestionar productos e inventario",
  "sales.view": "Ver ventas",
  "metrics.view": "Ver métricas",
  "users.manage": "Gestionar usuarios y permisos",
};

/** Default permission template for each role (mirror of the SQL function). */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [...PERMISSIONS],
  seller: ["orders.create", "customers.manage"],
  driver: ["orders.deliver"],
};

export function can(
  permissions: readonly string[] | null | undefined,
  permission: Permission,
): boolean {
  return !!permissions && permissions.includes(permission);
}
