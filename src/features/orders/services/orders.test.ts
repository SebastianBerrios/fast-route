import { describe, it, expect, vi } from "vitest";
import { insertOrder, insertOrderWithItems, toOrderRow } from "./orders";
import type { NewOrderInput } from "@/features/orders/domain/types";

// The service takes a Supabase client; tests pass a minimal mock cast to it.
type ServiceClient = Parameters<typeof insertOrder>[0];

const validInput: NewOrderInput = { lng: -77.03, lat: -12.04 };

describe("toOrderRow", () => {
  it("maps camelCase input to snake_case columns with null fallbacks", () => {
    expect(toOrderRow("u1", { lng: 1, lat: 2, customerName: "Ana" })).toEqual({
      created_by: "u1",
      lng: 1,
      lat: 2,
      customer_name: "Ana",
      note: null,
      customer_id: null,
      assigned_to: null,
    });
  });
});

describe("insertOrder", () => {
  it("rejects non-finite coordinates without touching the DB", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as ServiceClient;

    const res = await insertOrder(supabase, "u1", { ...validInput, lng: NaN });

    expect(res.error).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });

  it("inserts the mapped row and returns no error on success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const supabase = { from } as unknown as ServiceClient;

    const res = await insertOrder(supabase, "u1", validInput);

    expect(from).toHaveBeenCalledWith("orders");
    expect(insert).toHaveBeenCalledWith(toOrderRow("u1", validInput));
    expect(res.error).toBeNull();
  });

  it("propagates the DB error message", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const from = vi.fn(() => ({ insert }));
    const supabase = { from } as unknown as ServiceClient;

    const res = await insertOrder(supabase, "u1", validInput);

    expect(res.error).toBe("boom");
  });
});

describe("insertOrderWithItems", () => {
  it("rejects non-finite coordinates without calling the RPC", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as unknown as ServiceClient;

    const res = await insertOrderWithItems(
      supabase,
      { ...validInput, lat: Infinity },
      [],
    );

    expect(res.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with mapped args, using undefined for null optionals", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { rpc } as unknown as ServiceClient;

    const res = await insertOrderWithItems(
      supabase,
      { lng: -77, lat: -12, customerName: "Ana", customerId: null },
      [{ productId: "prod1", productName: "Agua", quantity: 2, unitPrice: 5 }],
    );

    expect(res.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("create_order_with_items", {
      p_lng: -77,
      p_lat: -12,
      p_customer_name: "Ana",
      p_note: undefined,
      p_customer_id: undefined,
      p_assigned_to: undefined,
      p_items: [
        {
          product_id: "prod1",
          product_name: "Agua",
          quantity: 2,
          unit_price: 5,
        },
      ],
    });
  });

  it("propagates the RPC error message", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "rpc fail" } });
    const supabase = { rpc } as unknown as ServiceClient;

    const res = await insertOrderWithItems(supabase, validInput, []);

    expect(res.error).toBe("rpc fail");
  });
});
