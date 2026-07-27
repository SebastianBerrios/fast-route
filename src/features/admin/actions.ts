"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/features/auth/server";
import type { UserRole } from "@/features/auth/domain/roles";
import {
  can,
  ROLE_DEFAULT_PERMISSIONS,
  type Permission,
} from "@/features/auth/domain/permissions";

export interface ActionResult {
  error: string | null;
}

/** Matches the minimum the signup form and Supabase Auth already enforce. */
const MIN_PASSWORD_LENGTH = 6;

/** Derived from the permission templates so it cannot drift from the enum. */
const VALID_ROLES = Object.keys(ROLE_DEFAULT_PERMISSIONS) as UserRole[];

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

export interface CreateTeamMemberInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

/**
 * Re-checks authorization server-side. The UI is never the access control, and
 * this runs BEFORE the service_role client is ever constructed.
 */
async function requireUserManager(): Promise<
  { error: string } | { tenantId: string }
> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Tu sesión expiró. Volvé a ingresar." };
  if (!can(actor.permissions, "users.manage"))
    return { error: "No tenés permiso para gestionar usuarios." };
  return { tenantId: actor.tenantId };
}

/**
 * Creates a team member: a brand-new auth user plus the `profiles` row that IS
 * the membership in the caller's business. Requires users.manage, and the
 * tenant comes from the CALLER's claims — never from client input — so an admin
 * can only ever add people to their own business.
 *
 * There is deliberately no self-service path into an existing business: an
 * invite code was a bearer token for membership, and in a shared auth pool
 * membership must be an explicit act by an admin of THIS app.
 *
 * It also refuses any email that ALREADY has an account. That is not a
 * limitation, it is the security boundary — see the createError branch below.
 */
export async function createTeamMember(
  input: CreateTeamMemberInput,
): Promise<ActionResult> {
  const auth = await requireUserManager();
  if ("error" in auth) return auth;

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) return { error: "El nombre es obligatorio." };
  if (!email) return { error: "El email es obligatorio." };
  if (input.password.length < MIN_PASSWORD_LENGTH)
    return {
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  // Reject an unknown role here rather than letting it reach the enum column,
  // where it would surface a raw Postgres error to the admin. It also stops
  // `permissions` from silently becoming undefined on the insert below.
  if (!VALID_ROLES.includes(input.role))
    return { error: "Elegí un rol válido." };

  const adminClient = createAdminClient();

  // 1. The auth user. email_confirm skips the confirmation email: the admin
  //    hands the credentials over directly and the address is already known.
  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (createError) {
    // Branch on `code`, not on message text — messages change between versions.
    // The message check is only a fallback for older Auth servers.
    const alreadyExists =
      createError.code === "email_exists" ||
      createError.message.toLowerCase().includes("already been registered");

    if (!alreadyExists) {
      // A revoked or rotated service_role key lands here and would otherwise
      // break every "add a member" attempt with no server-side trace at all.
      console.error(
        "createTeamMember: auth user creation failed",
        createError.code,
        createError.message,
      );
      return { error: createError.message };
    }

    // An email that already has an account is REFUSED, and that is the security
    // boundary of this action.
    //
    // Creating a business in fast-route is public self-service, and its creator
    // becomes an admin holding users.manage. So "admin" here is not a trusted
    // role the way it is in a single-property app like oasis — it is anyone who
    // signed up. If this branch granted membership to an account that already
    // exists, any such admin could type a stranger's address, enroll that
    // person into their own business without consent, and have the
    // `profiles_sync_role` trigger overwrite that person's fleet-wide
    // app_metadata claims. The PK on `profiles` does not stop it: it only
    // catches someone who is ALREADY a fast_route member, and the victim of
    // this attack is precisely someone who is not.
    //
    // With a brand-new email the admin demonstrably controls the credential
    // handoff, because they set the password themselves. With an address that
    // belongs to someone else they control nothing, and fast-route has no way
    // to verify they have any right to it. So: refuse.
    return {
      error:
        "Ese email ya tiene una cuenta y no puede agregarse desde acá. Usá otra dirección.",
    };
  }

  const userId = created.user.id;

  // 2. The membership. A plain insert, never an upsert: `userId` was minted
  //    moments ago so no row can exist for it, and if that assumption ever
  //    breaks we want a hard failure rather than a silent overwrite that would
  //    move someone between businesses or change their role behind the
  //    role-change guard's back.
  //
  //    The insert spans a second system, so it can REJECT (a dropped
  //    connection) as well as resolve with an error. Both must reach the
  //    cleanup below, or a throw would skip it and leave an orphan account in
  //    the shared auth pool with no trace.
  let profileError: { message: string } | null = null;
  try {
    const { error } = await adminClient.from("profiles").insert({
      id: userId,
      tenant_id: auth.tenantId,
      email,
      full_name: fullName,
      role: input.role,
      permissions: ROLE_DEFAULT_PERMISSIONS[input.role],
    });
    profileError = error;
  } catch (thrown) {
    profileError = {
      message:
        thrown instanceof Error
          ? thrown.message
          : "No se pudo guardar la membresía.",
    };
  }

  if (profileError) {
    // Every account reaching this point was created by us moments ago, so
    // deleting it is always safe — and necessary. The cleanup itself can fail
    // or throw; either way the admin still gets the real error below, because
    // losing the cleanup must not also lose the diagnosis.
    try {
      const { error: cleanupError } =
        await adminClient.auth.admin.deleteUser(userId);
      if (cleanupError) throw new Error(cleanupError.message);
    } catch (cleanupThrown) {
      // This is the one case that needs a human: the account survives with no
      // membership, and because an existing email is refused above, that
      // address can no longer be added through this form at all. Delete the
      // auth user in Supabase to free it up again.
      console.error(
        "createTeamMember: orphan auth user left behind, delete it in Supabase to free the email",
        userId,
        email,
        cleanupThrown instanceof Error ? cleanupThrown.message : cleanupThrown,
      );
    }

    return { error: profileError.message };
  }

  revalidatePath("/admin/users");
  return { error: null };
}
