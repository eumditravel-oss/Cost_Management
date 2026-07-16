import { describe, expect, it } from "vitest";
import { banks, companies, employees, taxRules, workers } from "./master-data";

describe("master data schema", () => {
  it("keeps worker and tax-rule records company scoped", () => {
    expect(workers.companyId.notNull).toBe(true);
    expect(employees.companyId.notNull).toBe(true);
    expect(banks.code.notNull).toBe(true);
    expect(taxRules.companyId.notNull).toBe(true);
    expect(companies.code.notNull).toBe(true);
  });
});
