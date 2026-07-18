import { z } from "zod";

const allowedColumns = [
  "occurredOn",
  "siteId",
  "costCategoryId",
  "itemName",
  "quantity",
  "unitPrice",
  "supplyAmount",
  "taxAmount",
  "totalAmount",
  "description",
  "entryStatus",
] as const;

export const savedFiltersSchema = z
  .object({
    version: z.literal(1),
    filters: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().trim().min(1).max(50),
            companyId: z.string().uuid(),
            query: z
              .object({
                from: z.string().date().optional(),
                to: z.string().date().optional(),
                siteId: z.string().uuid().optional(),
                costCategoryId: z.string().uuid().optional(),
                itemQuery: z.string().max(200).optional(),
              })
              .strict()
              .refine(
                (data) => {
                  if (data.from && data.to) {
                    return data.from <= data.to;
                  }
                  return true;
                },
                { message: "from_cannot_be_after_to" },
              ),
          })
          .strict(),
      )
      .max(30)
      .refine(
        (filters) => {
          // Name must be unique within same company (case-insensitive)
          const seen = new Set<string>();
          for (const f of filters) {
            const key = `${f.companyId}:${f.name.toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
          }
          return true;
        },
        { message: "duplicate_filter_name_in_company" },
      ),
  })
  .strict();

export const listColumnsSchema = z
  .object({
    version: z.literal(1),
    visibleColumnIds: z
      .array(z.enum(allowedColumns))
      .refine((arr) => new Set(arr).size === arr.length, {
        message: "duplicate_columns",
      })
      .refine(
        (arr) =>
          arr.includes("occurredOn") &&
          arr.includes("itemName") &&
          arr.includes("totalAmount"),
        { message: "missing_required_columns" },
      ),
    columnOrder: z
      .array(z.enum(allowedColumns))
      .length(allowedColumns.length, { message: "must_include_all_columns" })
      .refine((arr) => new Set(arr).size === arr.length, {
        message: "duplicate_columns",
      }),
  })
  .strict();
