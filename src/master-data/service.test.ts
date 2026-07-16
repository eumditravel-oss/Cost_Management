import { describe, expect, it } from "vitest";

import {
  MasterDataValidationError,
  parseMasterDataInput,
  parseMasterDataPatch,
} from "./service";

describe("master-data input validation", () => {
  it("accepts a minimal non-sensitive worker record", () => {
    expect(
      parseMasterDataInput("workers", {
        companyId: "00000000-0000-4000-8000-000000000001",
        code: "W-001",
        displayName: "Name",
      }),
    ).toMatchObject({ active: "active", code: "W-001" });
  });

  it("rejects an invalid tax precision without exposing its value", () => {
    expect(() =>
      parseMasterDataInput("tax-rules", {
        companyId: "00000000-0000-4000-8000-000000000001",
        code: "VAT",
        name: "Tax",
        rate: "10.00000",
      }),
    ).toThrow(MasterDataValidationError);
  });

  it("requires a non-empty change set", () => {
    expect(() => parseMasterDataPatch("companies", {})).toThrow(
      MasterDataValidationError,
    );
  });
});
