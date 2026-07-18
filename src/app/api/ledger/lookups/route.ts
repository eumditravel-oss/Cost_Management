import { NextRequest } from "next/server";
import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";
import { createDatabase } from "@/db/client";
import {
  companies,
  sites,
  costCategories,
  userCompanyMemberships,
  userSiteMemberships,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const identity = await getCurrentIdentity();
  if (!identity || !identity.userId) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!hasPermission(identity, "ledger.read")) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const companyIdParam = searchParams.get("companyId");

  const { client, database } = createDatabase();
  try {
    if (!companyIdParam) {
      // return companies the user has active membership in
      const userCompanies = await database
        .select({
          id: companies.id,
          name: companies.name,
        })
        .from(userCompanyMemberships)
        .innerJoin(companies, eq(userCompanyMemberships.companyId, companies.id))
        .where(
          and(
            eq(userCompanyMemberships.userId, identity.userId),
            eq(userCompanyMemberships.status, "active"),
            eq(companies.active, "active"),
          ),
        );
      return Response.json({ companies: userCompanies });
    }

    // Company specific lookups
    const parsedCompanyId = z.string().uuid().safeParse(companyIdParam);
    if (!parsedCompanyId.success) {
      return Response.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const companyId = parsedCompanyId.data;

    // Check user membership for the company
    const memberships = await database
      .select({
        id: userCompanyMemberships.id,
        siteAccessScope: userCompanyMemberships.siteAccessScope,
      })
      .from(userCompanyMemberships)
      .innerJoin(companies, eq(userCompanyMemberships.companyId, companies.id))
      .where(
        and(
          eq(userCompanyMemberships.userId, identity.userId),
          eq(userCompanyMemberships.companyId, companyId),
          eq(userCompanyMemberships.status, "active"),
          eq(companies.active, "active"),
        ),
      );

    if (memberships.length === 0) {
      return Response.json({ error: "SCOPE_FORBIDDEN" }, { status: 403 });
    }

    const membership = memberships[0];

    // Get allowed sites
    let allowedSites: { id: string; name: string }[] = [];
    if (membership.siteAccessScope === "all_sites") {
      allowedSites = await database
        .select({
          id: sites.id,
          name: sites.name,
        })
        .from(sites)
        .where(and(eq(sites.companyId, companyId), eq(sites.active, "active")));
    } else {
      allowedSites = await database
        .select({
          id: sites.id,
          name: sites.name,
        })
        .from(userSiteMemberships)
        .innerJoin(sites, eq(userSiteMemberships.siteId, sites.id))
        .where(
          and(
            eq(userSiteMemberships.companyMembershipId, membership.id),
            eq(userSiteMemberships.status, "active"),
            eq(sites.companyId, companyId),
            eq(sites.active, "active"),
          ),
        );
    }

    // Get cost categories
    const categories = await database
      .select({
        id: costCategories.id,
        name: costCategories.name,
      })
      .from(costCategories)
      .where(
        and(
          eq(costCategories.companyId, companyId),
          eq(costCategories.active, "active"),
        ),
      );

    return Response.json({
      sites: allowedSites,
      costCategories: categories,
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
