"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/features/auth/domain/roles";
import {
  ROLE_DEFAULT_PERMISSIONS,
  type Permission,
} from "@/features/auth/domain/permissions";

export interface ActionResult {
  error: string | null;
}

/**
 * Change a user's role AND reset their permissions to that role's template.
 * Fine-grained tweaks are applied afterwards via updateUserPermissions.
 * Authorization is enforced by RLS (users.manage) + the role-change trigger.
 */
export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role, permissions: ROLE_DEFAULT_PERMISSIONS[role] })
    .eq("id", userId);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { error: null };
}

/** Set a user's exact permission list (per-user override). */
export async function updateUserPermissions(
  userId: string,
  permissions: Permission[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ permissions })
    .eq("id", userId);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { error: null };
}

export interface CreateInviteResult {
  code: string | null;
  error: string | null;
}

/** Generate an invite code for the given role in the admin's tenant. */
export async function createInvite(
  role: UserRole,
): Promise<CreateInviteResult> {
  const supabase = await createClient();
  // tenant_id, created_by and code are filled by column defaults.
  const { data, error } = await supabase
    .from("invites")
    .insert({ role })
    .select("code")
    .single();

  if (error) return { code: null, error: error.message };
  revalidatePath("/admin/users");
  return { code: data.code, error: null };
}

/** Revoke (delete) a pending invite. */
export async function revokeInvite(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { error: null };
}
