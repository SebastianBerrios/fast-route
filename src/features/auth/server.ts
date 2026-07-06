import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/features/auth/domain/permissions";
import type { UserRole } from "@/features/auth/domain/roles";

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
}

/**
 * The signed-in user with role + permissions read from the JWT app_metadata,
 * so UI gating matches exactly what RLS enforces. Returns null if not signed in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.app_metadata as {
    role?: UserRole;
    permissions?: string[];
  };

  return {
    id: user.id,
    email: user.email ?? "",
    role: meta.role ?? "seller",
    permissions: (meta.permissions ?? []) as Permission[],
  };
}
