import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";
import { createDatabase } from "@/db/client";
import { costEntries, costEntryAuditLogs } from "@/db/schema";
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
  description: z.string().trim().max(5000).optional(),
});
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
  const parsed = entry.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: "VALIDATION_ERROR",
        fields: parsed.error.issues.map((i) => i.path.join(".")),
      },
      { status: 400 },
    );
  const value = parsed.data;
  const money = calculateMoney(value);
  if (money.fieldErrors.length)
    return Response.json(
      { error: "CALCULATION_INPUT_INVALID", fields: money.fieldErrors },
      { status: 400 },
    );
  const { client, database } = createDatabase();
  try {
    const id = crypto.randomUUID();
    const [record] = await database.transaction(async (tx) => {
      const [created] = await tx
        .insert(costEntries)
        .values({
          id,
          entryNumber: `E-${id.slice(0, 8).toUpperCase()}`,
          companyId: value.companyId,
          siteId: value.siteId,
          costCategoryId: value.costCategoryId,
          occurredOn: value.occurredOn,
          itemName: value.itemName,
          quantity: value.quantity,
          unitPrice: value.unitPrice,
          supplyAmount: money.supplyAmount,
          taxAmount: money.taxAmount,
          totalAmount: money.totalAmount,
          description: value.description,
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
      return [created];
    });
    return Response.json({ record }, { status: 201 });
  } catch {
    return Response.json({ error: "CONFLICT" }, { status: 409 });
  } finally {
    await client.end({ timeout: 5 });
  }
}
