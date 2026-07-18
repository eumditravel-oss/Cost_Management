import { eq, and } from "drizzle-orm";
import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";
import { createDatabase } from "@/db/client";
import { userPreferences, costCategories } from "@/db/schema";
import { savedFiltersSchema, listColumnsSchema } from "@/ledger/preferences";
import { checkUserSiteAccess } from "@/ledger/permissions";

const ALLOWED_KEYS = ["ledger.saved_filters.v1", "ledger.list_columns.v1"];

async function requirePermission() {
  const current = await getCurrentIdentity();
  if (!current) return null;
  return hasPermission(current, "ledger.read") ? current : false;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ preferenceKey: string }> },
) {
  const current = await requirePermission();
  if (!current)
    return Response.json(
      { error: current === null ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: current === null ? 401 : 403 },
    );

  const { preferenceKey } = await params;
  if (!ALLOWED_KEYS.includes(preferenceKey)) {
    return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { client, database } = createDatabase();
  try {
    const rows = await database
      .select({ value: userPreferences.value })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, current.userId),
          eq(userPreferences.preferenceKey, preferenceKey),
        ),
      );

    if (rows.length === 0) {
      return Response.json({ preference: null });
    }

    let validPreference = rows[0].value;
    if (preferenceKey === "ledger.saved_filters.v1") {
      const parsed = savedFiltersSchema.safeParse(validPreference);
      validPreference = parsed.success ? parsed.data : null;
    } else if (preferenceKey === "ledger.list_columns.v1") {
      const parsed = listColumnsSchema.safeParse(validPreference);
      validPreference = parsed.success ? parsed.data : null;
    }

    return Response.json({ preference: validPreference });
  } finally {
    await client.end();
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ preferenceKey: string }> },
) {
  const current = await requirePermission();
  if (!current)
    return Response.json(
      { error: current === null ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: current === null ? 401 : 403 },
    );

  const { preferenceKey } = await params;
  if (!ALLOWED_KEYS.includes(preferenceKey)) {
    return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { client, database } = createDatabase();
  try {
    if (preferenceKey === "ledger.saved_filters.v1") {
      const parsed = savedFiltersSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
      }

      for (const filter of parsed.data.filters) {
        const access = await checkUserSiteAccess(
          database,
          current.userId,
          filter.companyId,
          filter.query.siteId,
        );
        if (!access.allowed) {
          return Response.json({ error: "SCOPE_FORBIDDEN" }, { status: 403 });
        }

        if (filter.query.costCategoryId) {
          const cat = await database
            .select({ id: costCategories.id })
            .from(costCategories)
            .where(
              and(
                eq(costCategories.companyId, filter.companyId),
                eq(costCategories.id, filter.query.costCategoryId),
              ),
            );
          if (cat.length === 0) {
            return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
          }
        }
      }
    } else if (preferenceKey === "ledger.list_columns.v1") {
      const parsed = listColumnsSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
      }
    }

    await database
      .insert(userPreferences)
      .values({
        id: crypto.randomUUID(),
        userId: current.userId,
        preferenceKey,
        value: body,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.preferenceKey],
        set: {
          value: body,
          updatedAt: new Date(),
        },
      });

    return Response.json({ success: true });
  } finally {
    await client.end();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ preferenceKey: string }> },
) {
  const current = await requirePermission();
  if (!current)
    return Response.json(
      { error: current === null ? "UNAUTHENTICATED" : "FORBIDDEN" },
      { status: current === null ? 401 : 403 },
    );

  const { preferenceKey } = await params;
  if (!ALLOWED_KEYS.includes(preferenceKey)) {
    return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { client, database } = createDatabase();
  try {
    await database
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, current.userId),
          eq(userPreferences.preferenceKey, preferenceKey),
        ),
      );

    return Response.json({ success: true });
  } finally {
    await client.end();
  }
}
