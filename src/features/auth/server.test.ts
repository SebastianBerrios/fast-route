import { describe, it, expect, vi, beforeEach } from "vitest";

// server.ts pulls in "server-only"; stub it so the module loads under vitest.
vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { getCurrentUser } from "./server";

function withUser(app_metadata: Record<string, unknown> | undefined) {
  getUser.mockResolvedValue({
    data: {
      user: app_metadata
        ? { id: "u1", email: "a@b.c", app_metadata }
        : null,
    },
  });
}

/** Claims as the sync trigger writes them: under the app's own key. */
function withMember(claims: Record<string, unknown>) {
  withUser({ fast_route: claims });
}

describe("getCurrentUser — membership gate", () => {
  beforeEach(() => getUser.mockReset());

  it("returns null when there is no session", async () => {
    withUser(undefined);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null for an authenticated non-member (no claims)", async () => {
    // A user of another fleet app: valid session, but no fast_route membership.
    withUser({});
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when only role is present (tenant_id missing)", async () => {
    withMember({ role: "admin" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when only tenant_id is present (role missing)", async () => {
    withMember({ tenant_id: "t1" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("ignores TOP-LEVEL claims: only the fast_route namespace counts", async () => {
    // app_metadata is one blob shared across the fleet. A top-level role from
    // some other app must never be read as fast_route membership.
    withUser({ role: "admin", tenant_id: "t1", permissions: ["users.manage"] });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the member when both role and tenant_id claims are present", async () => {
    withMember({ role: "admin", tenant_id: "t1", permissions: ["orders.manage"] });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "a@b.c",
      tenantId: "t1",
      role: "admin",
      permissions: ["orders.manage"],
    });
  });

  it("defaults permissions to [] when the claim is absent", async () => {
    withMember({ role: "driver", tenant_id: "t1" });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "a@b.c",
      tenantId: "t1",
      role: "driver",
      permissions: [],
    });
  });
});
