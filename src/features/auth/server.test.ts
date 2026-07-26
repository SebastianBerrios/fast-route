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
    withUser({ role: "admin" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when only tenant_id is present (role missing)", async () => {
    withUser({ tenant_id: "t1" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the member when both role and tenant_id claims are present", async () => {
    withUser({ role: "admin", tenant_id: "t1", permissions: ["orders.manage"] });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "a@b.c",
      role: "admin",
      permissions: ["orders.manage"],
    });
  });

  it("defaults permissions to [] when the claim is absent", async () => {
    withUser({ role: "driver", tenant_id: "t1" });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "a@b.c",
      role: "driver",
      permissions: [],
    });
  });
});
