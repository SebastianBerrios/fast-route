import { describe, it, expect, vi, beforeEach } from "vitest";

const { signUp, signInWithPassword, refreshSession, rpc, redirect, revalidatePath } =
  vi.hoisted(() => ({
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    refreshSession: vi.fn(),
    rpc: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp, signInWithPassword, refreshSession },
    rpc,
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/features/routing/services/openrouteservice", () => ({
  geocodeAddress: vi.fn(async () => []),
}));
vi.mock("@/lib/http/origin", () => ({
  getRequestOrigin: vi.fn(async () => "https://test.app"),
}));

import { authenticate } from "./actions";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [signUp, signInWithPassword, refreshSession, rpc, redirect, revalidatePath].forEach(
    (m) => m.mockReset(),
  );
  refreshSession.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ error: null });
});

describe("authenticate — enrollment orchestration", () => {
  it("sign-in: enrolls, refreshes, then redirects into the app", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    await authenticate({}, fd({ intent: "signin", email: "a@b.c", password: "pw" }));

    expect(rpc).toHaveBeenCalledWith("enroll_self");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("sign-in: an enrollment error is surfaced and blocks the redirect", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: { message: "Not authenticated" } });

    const res = await authenticate(
      {},
      fd({ intent: "signin", email: "a@b.c", password: "pw" }),
    );

    expect(res).toEqual({ error: "Not authenticated" });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sign-up with an immediate session: nests intent under fast_route, enrolls, redirects", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    await authenticate(
      {},
      fd({ intent: "signup", email: "a@b.c", password: "pw", business_name: "Acme" }),
    );

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://test.app/login",
          data: expect.objectContaining({ fast_route: { business_name: "Acme" } }),
        }),
      }),
    );
    expect(rpc).toHaveBeenCalledWith("enroll_self");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("sign-up needing email confirmation (no session): does NOT enroll or redirect", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });

    const res = await authenticate(
      {},
      fd({ intent: "signup", email: "a@b.c", password: "pw", business_name: "Acme" }),
    );

    expect(res?.message).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sign-in: a session-refresh failure is non-fatal — still redirects", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    refreshSession.mockResolvedValue({ error: { message: "network blip" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await authenticate({}, fd({ intent: "signin", email: "a@b.c", password: "pw" }));

    expect(redirect).toHaveBeenCalledWith("/");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("sign-up without a business name is rejected: there is no join-a-business path", async () => {
    const res = await authenticate(
      {},
      fd({ intent: "signup", email: "a@b.c", password: "pw" }),
    );

    expect(res).toEqual({ error: "Ingresá el nombre de tu negocio." });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sign-up ignores a client-supplied invite_code — the field carries no meaning", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    await authenticate(
      {},
      fd({
        intent: "signup",
        email: "a@b.c",
        password: "pw",
        business_name: "Acme",
        invite_code: "abc123",
      }),
    );

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({ fast_route: { business_name: "Acme" } }),
        }),
      }),
    );
  });
});
