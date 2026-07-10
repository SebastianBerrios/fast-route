import { describe, it, expect } from "vitest";
import {
  stockLevel,
  isLowStock,
  formatPrice,
  type Product,
} from "./types";

const product = (over: Partial<Product>): Product => ({
  id: "p1",
  createdBy: "u1",
  name: "Agua",
  unit: null,
  price: 0,
  isActive: true,
  stock: 0,
  minStock: 0,
  stockSourceId: null,
  createdAt: "",
  ...over,
});

describe("stockLevel", () => {
  it("flags negative stock as 'negative' regardless of minStock", () => {
    expect(stockLevel(-1, 0)).toBe("negative");
    expect(stockLevel(-5, 10)).toBe("negative");
  });

  it("flags zero stock as 'low' even when minStock is 0", () => {
    // The bug this fixes: with minStock 0 the old isLowStock() returned false,
    // so out-of-stock/negative products showed as a green "in stock" badge.
    expect(stockLevel(0, 0)).toBe("low");
  });

  it("flags stock at or below the min-stock threshold as 'low'", () => {
    expect(stockLevel(3, 3)).toBe("low");
    expect(stockLevel(2, 3)).toBe("low");
  });

  it("returns 'ok' above the threshold or when positive with no threshold", () => {
    expect(stockLevel(4, 3)).toBe("ok");
    expect(stockLevel(1, 0)).toBe("ok");
  });
});

describe("isLowStock", () => {
  it("stays false for negative stock when minStock is 0 (alert disabled)", () => {
    // Documents why stockLevel exists: isLowStock alone misses the negative case.
    expect(isLowStock(product({ stock: -5, minStock: 0 }))).toBe(false);
  });

  it("is true at or below a configured threshold", () => {
    expect(isLowStock(product({ stock: 2, minStock: 5 }))).toBe(true);
    expect(isLowStock(product({ stock: 5, minStock: 5 }))).toBe(true);
  });

  it("is false above the threshold", () => {
    expect(isLowStock(product({ stock: 6, minStock: 5 }))).toBe(false);
  });
});

describe("formatPrice", () => {
  it("formats soles with two decimals", () => {
    expect(formatPrice(12.5)).toBe("S/ 12.50");
    expect(formatPrice(0)).toBe("S/ 0.00");
  });
});
