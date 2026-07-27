import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getCurrentUser,
  createUser,
  deleteUser,
  listUsers,
  insert,
  from,
  sessionFrom,
  deleteSelect,
  revalidatePath,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  listUsers: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  sessionFrom: vi.fn(),
  deleteSelect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/server", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { createUser, deleteUser, listUsers } },
    from,
  })),
}));
// The session-bound client is a DIFFERENT client from the service_role one:
// revoking goes through it on purpose, so RLS enforces the tenant boundary.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: sessionFrom })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import { createTeamMember, revokeTeamMemberAccess } from "./actions";

const ADMIN = {
  id: "admin-1",
  email: "owner@acme.test",
  tenantId: "tenant-1",
  role: "admin" as const,
  permissions: ["users.manage" as const],
};

const VALID = {
  fullName: "Ana Repartidora",
  email: "Ana@Acme.test",
  password: "secret123",
  role: "driver" as const,
};

beforeEach(() => {
  [
    getCurrentUser,
    createUser,
    deleteUser,
    listUsers,
    insert,
    from,
    sessionFrom,
    deleteSelect,
    revalidatePath,
  ].forEach((m) => m.mockReset());

  getCurrentUser.mockResolvedValue(ADMIN);
  createUser.mockResolvedValue({ data: { user: { id: "new-1" } }, error: null });
  insert.mockResolvedValue({ error: null });
  from.mockReturnValue({ insert });

  // supabase.from("profiles").delete().eq("id", x).select("id")
  deleteSelect.mockResolvedValue({ data: [{ id: "member-2" }], error: null });
  sessionFrom.mockReturnValue({
    delete: () => ({ eq: () => ({ select: deleteSelect }) }),
  });
});

describe("createTeamMember — authorization", () => {
  it("rejects a caller without a session", async () => {
    getCurrentUser.mockResolvedValue(null);

    const res = await createTeamMember(VALID);

    expect(res.error).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a member who lacks users.manage", async () => {
    getCurrentUser.mockResolvedValue({ ...ADMIN, permissions: ["orders.create"] });

    const res = await createTeamMember(VALID);

    expect(res.error).toBeTruthy();
    // The service_role key must never be reached by an unauthorized caller.
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("createTeamMember — validation", () => {
  it("requires a name", async () => {
    const res = await createTeamMember({ ...VALID, fullName: "  " });

    expect(res.error).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("requires an email", async () => {
    const res = await createTeamMember({ ...VALID, email: "" });

    expect(res.error).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than the minimum", async () => {
    const res = await createTeamMember({ ...VALID, password: "12345" });

    expect(res.error).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("accepts a password exactly at the minimum", async () => {
    // Pins the boundary: flipping `<` to `<=` would reject every legal
    // 6-character password and the test above would still pass.
    const res = await createTeamMember({ ...VALID, password: "123456" });

    expect(res.error).toBeNull();
    expect(createUser).toHaveBeenCalled();
  });

  it("rejects a role outside the enum before it reaches the database", async () => {
    const res = await createTeamMember({
      ...VALID,
      role: "owner" as (typeof VALID)["role"],
    });

    expect(res.error).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("createTeamMember — happy path", () => {
  it("creates a confirmed auth user with the normalized email", async () => {
    await createTeamMember(VALID);

    expect(createUser).toHaveBeenCalledWith({
      email: "ana@acme.test",
      password: "secret123",
      email_confirm: true,
      user_metadata: { full_name: "Ana Repartidora" },
    });
  });

  it("writes the membership into the CALLER's tenant with the role's permissions", async () => {
    await createTeamMember(VALID);

    expect(from).toHaveBeenCalledWith("profiles");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-1",
        tenant_id: "tenant-1",
        email: "ana@acme.test",
        full_name: "Ana Repartidora",
        role: "driver",
        permissions: expect.arrayContaining(["orders.deliver"]),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("reports success with no extra state", async () => {
    const res = await createTeamMember(VALID);

    expect(res).toEqual({ error: null });
  });
});

describe("createTeamMember — email that already has an account", () => {
  // THE security boundary of this action. Creating a business is public
  // self-service and its creator becomes an admin with users.manage, so
  // granting membership to an account that already exists would let anyone
  // enroll a stranger into their business without consent.
  beforeEach(() => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", message: "already been registered" },
    });
  });

  it("refuses instead of enrolling an account it does not control", async () => {
    const res = await createTeamMember(VALID);

    expect(res.error).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });

  it("never touches the existing account: no lookup, no delete, no password change", async () => {
    await createTeamMember(VALID);

    expect(listUsers).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses on the legacy message too, when no error code is returned", async () => {
    // Older Auth servers omit `code`; the message fallback must still refuse
    // rather than fall through to the generic error path.
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email has already been registered" },
    });

    const res = await createTeamMember(VALID);

    expect(res.error).toContain("ya tiene una cuenta");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("createTeamMember — failure cleanup", () => {
  it("removes the auth user it just created when the membership insert fails", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    deleteUser.mockResolvedValue({ error: null });

    const res = await createTeamMember(VALID);

    expect(res.error).toBeTruthy();
    // Otherwise the shared auth pool keeps an account with no membership.
    expect(deleteUser).toHaveBeenCalledWith("new-1");
  });

  it("cleans up when the membership insert THROWS, not just when it returns an error", async () => {
    // A rejected insert (dropped connection) must reach the same compensating
    // delete as a resolved error, or the shared auth pool keeps an orphan.
    insert.mockRejectedValue(new Error("connection reset"));
    deleteUser.mockResolvedValue({ error: null });

    const res = await createTeamMember(VALID);

    expect(res.error).toBe("connection reset");
    expect(deleteUser).toHaveBeenCalledWith("new-1");
  });

  it("still reports the real error when the cleanup itself throws", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    deleteUser.mockRejectedValue(new Error("auth api down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await createTeamMember(VALID);

    // Losing the cleanup must not swallow the diagnosis the admin needs.
    expect(res.error).toBe("denied");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("surfaces an unexpected createUser error without inserting anything", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure", message: "auth is down" },
    });

    const res = await createTeamMember(VALID);

    expect(res.error).toBe("auth is down");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("revokeTeamMemberAccess", () => {
  it("rejects a caller without users.manage", async () => {
    getCurrentUser.mockResolvedValue({ ...ADMIN, permissions: ["orders.create"] });

    const res = await revokeTeamMemberAccess("member-2");

    expect(res.error).toBeTruthy();
    expect(sessionFrom).not.toHaveBeenCalled();
  });

  it("refuses to let an admin revoke themselves", async () => {
    const res = await revokeTeamMemberAccess(ADMIN.id);

    expect(res.error).toBeTruthy();
    // Self-removal is a lockout; it must not even reach the database.
    expect(sessionFrom).not.toHaveBeenCalled();
  });

  it("deletes the membership through the SESSION client, so RLS scopes it", async () => {
    const res = await revokeTeamMemberAccess("member-2");

    expect(res.error).toBeNull();
    expect(sessionFrom).toHaveBeenCalledWith("profiles");
    // The service_role client bypasses RLS and must stay out of this path.
    expect(from).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("treats a zero-row delete as a permission failure, not success", async () => {
    // RLS silently deletes nothing when the target is in another tenant.
    deleteSelect.mockResolvedValue({ data: [], error: null });

    const res = await revokeTeamMemberAccess("member-of-other-tenant");

    expect(res.error).toBeTruthy();
  });

  it("translates the last-admin guard into something the admin can act on", async () => {
    deleteSelect.mockResolvedValue({
      data: null,
      error: { message: 'El negocio tiene que quedar con al menos un administrador' },
    });

    const res = await revokeTeamMemberAccess("member-2");

    expect(res.error).toContain("al menos un administrador");
  });

  it("never deletes the auth user: that account may belong to another app", async () => {
    await revokeTeamMemberAccess("member-2");

    expect(deleteUser).not.toHaveBeenCalled();
  });
});
