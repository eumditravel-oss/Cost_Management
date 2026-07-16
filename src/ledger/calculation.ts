export type MoneyCalculationInput = {
  quantity?: string | null;
  unitPrice?: string | null;
  supplyAmount?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
};
export type MoneyCalculation = {
  supplyAmount: string;
  taxAmount: string;
  totalAmount: string;
  fieldErrors: readonly string[];
};

function scaled(value: string, scale: number) {
  const [whole, fraction = ""] = value.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction))
    throw new Error("INVALID_DECIMAL");
  const sign = whole.startsWith("-") ? -BigInt(1) : BigInt(1);
  const digits = whole.replace("-", "") + fraction.padEnd(scale, "0").slice(0, scale);
  return sign * BigInt(digits || "0");
}
function format(value: bigint, scale = 2) {
  const negative = value < BigInt(0);
  const raw = (negative ? -value : value).toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
}
function roundDivide(value: bigint, divisor: bigint) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const result = (absolute + divisor / BigInt(2)) / divisor;
  return negative ? -result : result;
}

export function calculateMoney(input: MoneyCalculationInput): MoneyCalculation {
  const errors: string[] = [];
  let supply = BigInt(0);
  let tax = BigInt(0);
  try {
    if (input.quantity && input.unitPrice)
      supply = roundDivide(
        scaled(input.quantity, 4) * scaled(input.unitPrice, 2),
        BigInt(10000),
      );
    else if (input.supplyAmount) supply = scaled(input.supplyAmount, 2);
    else errors.push("supplyAmount");
  } catch {
    errors.push("quantityOrUnitPrice");
  }
  try {
    if (input.taxAmount) tax = scaled(input.taxAmount, 2);
    else if (input.taxRate)
      tax = roundDivide(supply * scaled(input.taxRate, 4), BigInt(1000000));
  } catch {
    errors.push("taxAmountOrTaxRate");
  }
  return {
    supplyAmount: format(supply),
    taxAmount: format(tax),
    totalAmount: format(supply + tax),
    fieldErrors: errors,
  };
}
