import { desc, eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";
import { createDatabase } from "@/db/client";
import { costEntries, costEntryAuditLogs, sites, costCategories } from "@/db/schema";
import { calculateMoney } from "@/ledger/calculation";

const entry = z.object({
  companyId: z.uuid(),
  siteId: z.uuid(),
  costCategoryId: z.uuid(),
  occurredOn: z.string().date(),
  itemName: z.string().trim().min(1).max(200),
  quantity: z.string().optional(),
  unitPrice: z.string().optional(),
  supplyAmount: z.string().optional(),
  taxRate: z.string().optional(),
  taxAmount: z.string().optional(),
  isManualTax: z.boolean().optional(),
  description: z.string().trim().max(5000).optional(),
});
const batchRequest = z.array(entry).min(1).max(100);

async function identity() {
  const current = await getCurrentIdentity();
  if (!current) return null;
  return hasPermission(current, "master_data.write") ? current : false;
}

export async function GET(request: Request) {
  const current = await identity();
  if (!current)
    return Response.json(
      { error: current === null ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: current === null ? 401 : 403 },
    );
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId)
    return Response.json({ error: "COMPANY_ID_REQUIRED" }, { status: 400 });
  const { client, database } = createDatabase();
  try {
    return Response.json({
      records: await database
        .select()
        .from(costEntries)
        .where(eq(costEntries.companyId, companyId))
        .orderBy(desc(costEntries.occurredOn))
        .limit(200),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function POST(request: Request) {
  const current = await identity();
  if (!current)
    return Response.json(
      { error: current === null ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: current === null ? 401 : 403 },
    );

  const parsed = batchRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: "VALIDATION_ERROR",
        fields: parsed.error.issues.map((i) => i.path.join(".")),
      },
      { status: 400 },
    );

  const batch = parsed.data;

  const companyIds = Array.from(new Set(batch.map((b) => b.companyId)));
  if (companyIds.length !== 1) {
    return Response.json(
      { error: "VALIDATION_ERROR", fields: ["companyId_must_be_uniform"] },
      { status: 400 },
    );
  }
  const companyId = companyIds[0];

  const processedBatch: {
    value: z.infer<typeof entry>;
    money: ReturnType<typeof calculateMoney>;
  }[] = [];
  for (let i = 0; i < batch.length; i++) {
    const value = batch[i];
    const money = calculateMoney({
      ...value,
      quantity: value.quantity || undefined,
      unitPrice: value.unitPrice || undefined,
      supplyAmount: value.supplyAmount || undefined,
      taxRate: value.taxRate || undefined,
      taxAmount: value.taxAmount || undefined,
    });
    if (money.fieldErrors.length)
      return Response.json(
        {
          error: "CALCULATION_INPUT_INVALID",
          fields: money.fieldErrors.map((f) => `[${i}].${f}`),
        },
        { status: 400 },
      );
    processedBatch.push({ value, money });
  }

  const { client, database } = createDatabase();
  try {
    const siteIds = Array.from(new Set(batch.map((b) => b.siteId)));
    const categoryIds = Array.from(new Set(batch.map((b) => b.costCategoryId)));

    const validSites = await database
      .select({ id: sites.id })
      .from(sites)
      .where(inArray(sites.id, siteIds));
    const siteMap = new Map(validSites.map((s) => [s.id, s]));

    for (const sid of siteIds) {
      if (!siteMap.has(sid)) throw new Error("INVALID_SITE_FOR_COMPANY");
    }

    // Check companyId matches
    const sitesCompanyCheck = await database
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.companyId, companyId), inArray(sites.id, siteIds)));
    if (sitesCompanyCheck.length !== siteIds.length) {
      return Response.json({ error: "INVALID_SITE_FOR_COMPANY" }, { status: 400 });
    }

    const categoriesCompanyCheck = await database
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(
        and(
          eq(costCategories.companyId, companyId),
          inArray(costCategories.id, categoryIds),
        ),
      );
    if (categoriesCompanyCheck.length !== categoryIds.length) {
      return Response.json({ error: "INVALID_CATEGORY_FOR_COMPANY" }, { status: 400 });
    }

    const records = await database.transaction(async (tx) => {
      const createdRecords = [];
      for (const item of processedBatch) {
        const id = crypto.randomUUID();
        const [created] = await tx
          .insert(costEntries)
          .values({
            id,
            entryNumber: `E-${id.slice(0, 8).toUpperCase()}`,
            companyId: item.value.companyId,
            siteId: item.value.siteId,
            costCategoryId: item.value.costCategoryId,
            occurredOn: item.value.occurredOn,
            itemName: item.value.itemName,
            quantity: item.value.quantity,
            unitPrice: item.value.unitPrice,
            supplyAmount: item.money.supplyAmount,
            taxAmount: item.money.taxAmount,
            totalAmount: item.money.totalAmount,
            description: item.value.description,
            createdByUserId: current.userId,
            updatedByUserId: current.userId,
          })
          .returning();
        await tx.insert(costEntryAuditLogs).values({
          id: crypto.randomUUID(),
          costEntryId: id,
          actorUserId: current.userId,
          action: "create",
          afterValue: created,
        });
        createdRecords.push(created);
      }
      return createdRecords;
    });
    return Response.json({ records }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "INVALID_SITE_FOR_COMPANY") {
      return Response.json({ error: "INVALID_SITE_FOR_COMPANY" }, { status: 400 });
    }
    if (
      (error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: unknown }).code === "23505") ||
      String(error).includes("unique constraint")
    ) {
      return Response.json({ error: "CONFLICT" }, { status: 409 });
    }
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  } finally {
    await client.end({ timeout: 5 });
  }
}
