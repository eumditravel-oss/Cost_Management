import { describe, expect, it } from "vitest";
import { calculateMoney } from "./calculation";
describe("central money calculation", () => {
  it("calculates quantity times unit price and a tax rule with half-up rounding", () =>
    expect(
      calculateMoney({ quantity: "2.5000", unitPrice: "1000.00", taxRate: "10.0000" }),
    ).toMatchObject({
      supplyAmount: "2500.00",
      taxAmount: "250.00",
      totalAmount: "2750.00",
    }));
  it("uses an explicitly entered supply amount when quantity inputs are absent", () =>
    expect(
      calculateMoney({
        supplyAmount: "12.34",
        taxAmount: "0.66",
        isManualTax: true,
      }).totalAmount,
    ).toBe("13.00"));

  it("ignores taxAmount and calculates from taxRate if isManualTax is false", () =>
    expect(
      calculateMoney({
        supplyAmount: "100.00",
        taxAmount: "99.99",
        taxRate: "10.0000",
      }).taxAmount,
    ).toBe("10.00"));
});
