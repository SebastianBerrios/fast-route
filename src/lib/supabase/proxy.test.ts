import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The membership wall is a pure function of (app_metadata claims, path). Mock the
// Supabase boundary so we can drive getUser() directly.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv: () => ({ url: "http://localhost", anonKey: "anon" }),
}));

import { updateSession } from "./proxy";

function req(path: string) {
  return new NextRequest(new URL(path, "http://localhost"));
}
function setUser(app_metadata: Record<string, unknown> | null) {
  getUser.mockResolvedValue({
    data: {
      user: app_metadata ? { id: "u", email: "e@x.y", app_metadata } : null,
    },
  });
}
function location(res: Response) {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname : null;
}

const MEMBER = { role: "admin", tenant_id: "t1" };
const NON_MEMBER = {}; // authenticated in the shared pool, but not a member

beforeEach(() => getUser.mockReset());

describe("updateSession — membership wall", () => {
  it("anonymous on a protected page -> /login", async () => {
    setUser(null);
    expect(location(await updateSession(req("/")))).toBe("/login");
  });

  it("anonymous on /api -> 401, no redirect", async () => {
    setUser(null);
    const res = await updateSession(req("/api/orders"));
    expect(res.status).toBe(401);
    expect(location(res)).toBeNull();
  });

  it("non-member on a protected page -> /no-access (never /login)", async () => {
    setUser(NON_MEMBER);
    expect(location(await updateSession(req("/")))).toBe("/no-access");
  });

  it("non-member on /api -> 403, no redirect", async () => {
    setUser(NON_MEMBER);
    const res = await updateSession(req("/api/orders"));
    expect(res.status).toBe(403);
  });

  it("non-member on /no-access -> passes through (the wall itself)", async () => {
    setUser(NON_MEMBER);
    expect(location(await updateSession(req("/no-access")))).toBeNull();
  });

  it("non-member on /login -> /no-access, not into the app", async () => {
    setUser(NON_MEMBER);
    expect(location(await updateSession(req("/login")))).toBe("/no-access");
  });

  it("member on /login -> / (into the app)", async () => {
    setUser(MEMBER);
    expect(location(await updateSession(req("/login")))).toBe("/");
  });

  it("member on a protected page -> passes through", async () => {
    setUser(MEMBER);
    expect(location(await updateSession(req("/orders")))).toBeNull();
  });

  it("member on /no-access -> / (a member has no business on the wall)", async () => {
    setUser(MEMBER);
    expect(location(await updateSession(req("/no-access")))).toBe("/");
  });
});
