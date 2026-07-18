import { eq, and } from "drizzle-orm";
import { userCompanyMemberships, userSiteMemberships } from "@/db/schema";

export type SiteAccessResult =
  | { allowed: false; error: "SCOPE_FORBIDDEN" }
  | { allowed: true; allowedSiteIds: string[] | null };

/**
 * Checks if the user has access to the specified company and site.
 * If siteId is provided, checks if it's within the allowed scopes.
 * Returns the list of allowed site IDs if the scope is "selected_sites", or null if "all_sites".
 */
export async function checkUserSiteAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  userId: string,
  companyId: string,
  siteId?: string | null,
): Promise<SiteAccessResult> {
  const companyScope = await database
    .select({
      id: userCompanyMemberships.id,
      scope: userCompanyMemberships.siteAccessScope,
    })
    .from(userCompanyMemberships)
    .where(
      and(
        eq(userCompanyMemberships.userId, userId),
        eq(userCompanyMemberships.companyId, companyId),
        eq(userCompanyMemberships.status, "active"),
      ),
    );

  if (companyScope.length === 0) {
    return { allowed: false, error: "SCOPE_FORBIDDEN" };
  }

  const scope = companyScope[0].scope;

  if (scope === "selected_sites") {
    const siteScopes = await database
      .select({ siteId: userSiteMemberships.siteId })
      .from(userSiteMemberships)
      .where(
        and(
          eq(userSiteMemberships.companyMembershipId, companyScope[0].id),
          eq(userSiteMemberships.status, "active"),
        ),
      );
    const allowedSiteIds = siteScopes.map((s: { siteId: string }) => s.siteId);

    if (siteId && !allowedSiteIds.includes(siteId)) {
      return { allowed: false, error: "SCOPE_FORBIDDEN" };
    }

    return { allowed: true, allowedSiteIds };
  }

  return { allowed: true, allowedSiteIds: null };
}
