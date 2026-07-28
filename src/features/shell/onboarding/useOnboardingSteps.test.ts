import { describe, it, expect } from "vitest";
import { computeSteps, type Counts } from "./useOnboardingSteps";
import type { Permission } from "@/features/auth/domain/permissions";

const OWNER: Permission[] = [
  "products.manage",
  "customers.manage",
  "users.manage",
];
const EMPTY: Counts = { products: 0, customers: 0, team: 1 };

const ids = (counts: Counts, perms: Permission[]) =>
  computeSteps(counts, perms).map((s) => s.id);
const doneIds = (counts: Counts, perms: Permission[]) =>
  computeSteps(counts, perms)
    .filter((s) => s.done)
    .map((s) => s.id);

describe("computeSteps — who sees the setup flow", () => {
  it("shows the three steps to a business owner", () => {
    expect(ids(EMPTY, OWNER)).toEqual(["products", "customers", "team"]);
  });

  it("shows nothing to a member without products.manage", () => {
    // The master gate: setup is the owner's job. A seller or driver must never
    // be handed a "finish setting up the business" wizard.
    expect(ids(EMPTY, ["orders.create", "customers.manage"])).toEqual([]);
    expect(ids(EMPTY, ["orders.deliver"])).toEqual([]);
    expect(ids(EMPTY, [])).toEqual([]);
  });

  it("hides individual steps the owner has no permission for", () => {
    expect(ids(EMPTY, ["products.manage"])).toEqual(["products"]);
    expect(ids(EMPTY, ["products.manage", "users.manage"])).toEqual([
      "products",
      "team",
    ]);
  });
});

describe("computeSteps — what counts as done", () => {
  it("marks a step done as soon as the data exists", () => {
    expect(doneIds({ products: 1, customers: 0, team: 1 }, OWNER)).toEqual([
      "products",
    ]);
    expect(doneIds({ products: 0, customers: 3, team: 1 }, OWNER)).toEqual([
      "customers",
    ]);
  });

  it("does not count the owner alone as a team", () => {
    // The owner's own profile is the first row, so a lone founder is at 1.
    expect(doneIds({ ...EMPTY, team: 1 }, OWNER)).toEqual([]);
    expect(doneIds({ ...EMPTY, team: 2 }, OWNER)).toEqual(["team"]);
  });

  it("completes everything when all three have data", () => {
    expect(doneIds({ products: 2, customers: 5, team: 4 }, OWNER)).toEqual([
      "products",
      "customers",
      "team",
    ]);
  });
});
