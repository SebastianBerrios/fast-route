import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/features/auth/domain/permissions";
import type { UserRole } from "@/features/auth/domain/roles";

export interface CurrentUser {
  id: string;
  email: string;
  /** The business this member belongs to. Exposed because server-side writes
   *  that bypass RLS (see lib/supabase/admin) must scope themselves to it. */
  tenantId: string;
  role: UserRole;
  permissions: Permission[];
}

/**
 * The signed-in fast_route MEMBER with role + permissions read from the JWT
 * app_metadata, so UI gating matches exactly what RLS enforces. Returns null
 * when there is no session OR when the session belongs to the shared mvp-lab
 * auth pool but is not a fast_route member.
 *
 * A real member always carries `role` + `tenant_id` claims (written by the
 * enrollment sync trigger). Their absence means an authenticated non-member, who
 * must NEVER be handed a fabricated identity — the /no-access wall (enforced in
 * the proxy middleware) keeps them out of the app entirely.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.app_metadata as {
    role?: UserRole;
    tenant_id?: string;
    permissions?: string[];
  };

  if (!meta.role || !meta.tenant_id) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    tenantId: meta.tenant_id,
    role: meta.role,
    permissions: (meta.permissions ?? []) as Permission[],
  };
}
