import { describe, it, expect, vi } from "vitest";

// origin.ts imports next/headers at module load; stub it (resolveOrigin never uses it).
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { resolveOrigin } from "./origin";

describe("resolveOrigin", () => {
  it("defaults localhost to http", () => {
    expect(resolveOrigin("localhost:3000", null)).toBe("http://localhost:3000");
  });

  it("defaults loopback to http", () => {
    expect(resolveOrigin("127.0.0.1:3000", null)).toBe("http://127.0.0.1:3000");
  });

  it("defaults a public host to https", () => {
    expect(resolveOrigin("fast-route-app.vercel.app", null)).toBe(
      "https://fast-route-app.vercel.app",
    );
  });

  it("honors an explicit forwarded protocol", () => {
    expect(resolveOrigin("fast-route-app.vercel.app", "http")).toBe(
      "http://fast-route-app.vercel.app",
    );
  });

  it("falls back to localhost when the host is missing", () => {
    expect(resolveOrigin(null, null)).toBe("http://localhost:3000");
  });
});
