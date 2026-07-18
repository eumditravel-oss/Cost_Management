import { describe, it, expect } from "vitest";
import { savedFiltersSchema, listColumnsSchema } from "./preferences";

describe("Preferences Schemas", () => {
  describe("savedFiltersSchema", () => {
    it("validates a correct saved filters object", () => {
      const result = savedFiltersSchema.safeParse({
        version: 1,
        filters: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            name: "My Filter",
            companyId: "123e4567-e89b-12d3-a456-426614174001",
            query: {
              from: "2023-01-01",
              to: "2023-12-31",
              siteId: "123e4567-e89b-12d3-a456-426614174002",
              costCategoryId: "123e4567-e89b-12d3-a456-426614174003",
              itemQuery: "apple",
            },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown fields in query", () => {
      const result = savedFiltersSchema.safeParse({
        version: 1,
        filters: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            name: "My Filter",
            companyId: "123e4567-e89b-12d3-a456-426614174001",
            query: {
              from: "2023-01-01",
              limit: 50, // not allowed
            },
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects when from > to", () => {
      const result = savedFiltersSchema.safeParse({
        version: 1,
        filters: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            name: "My Filter",
            companyId: "123e4567-e89b-12d3-a456-426614174001",
            query: {
              from: "2023-12-31",
              to: "2023-01-01",
            },
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("from_cannot_be_after_to");
      }
    });

    it("rejects duplicate names within the same company (case-insensitive)", () => {
      const result = savedFiltersSchema.safeParse({
        version: 1,
        filters: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            name: "My Filter",
            companyId: "123e4567-e89b-12d3-a456-426614174001",
            query: {},
          },
          {
            id: "123e4567-e89b-12d3-a456-426614174002",
            name: "MY FILTER",
            companyId: "123e4567-e89b-12d3-a456-426614174001",
            query: {},
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("duplicate_filter_name_in_company");
      }
    });
  });

  describe("listColumnsSchema", () => {
    const allCols = [
      "occurredOn",
      "siteId",
      "costCategoryId",
      "itemName",
      "quantity",
      "unitPrice",
      "supplyAmount",
      "taxRate",
      "taxAmount",
      "totalAmount",
      "description",
    ];

    it("validates a correct list columns object", () => {
      const result = listColumnsSchema.safeParse({
        version: 1,
        visibleColumnIds: ["occurredOn", "itemName", "totalAmount"],
        columnOrder: allCols,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required columns in visibleColumnIds", () => {
      const result = listColumnsSchema.safeParse({
        version: 1,
        visibleColumnIds: ["occurredOn", "totalAmount"], // missing itemName
        columnOrder: allCols,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("missing_required_columns");
      }
    });

    it("rejects duplicate columns in visibleColumnIds", () => {
      const result = listColumnsSchema.safeParse({
        version: 1,
        visibleColumnIds: ["occurredOn", "itemName", "totalAmount", "occurredOn"],
        columnOrder: allCols,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("duplicate_columns");
      }
    });

    it("rejects incomplete columnOrder", () => {
      const result = listColumnsSchema.safeParse({
        version: 1,
        visibleColumnIds: ["occurredOn", "itemName", "totalAmount"],
        columnOrder: ["occurredOn", "itemName", "totalAmount"], // Not 11 columns
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("must_include_all_columns");
      }
    });
  });
});
