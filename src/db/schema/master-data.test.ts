import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  banks,
  companies,
  employees,
  taxRules,
  workers,
  sites,
  userCompanyMemberships,
  userSiteMemberships,
} from "./master-data";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("master data schema", () => {
  it("keeps worker and tax-rule records company scoped", () => {
    expect(workers.companyId.notNull).toBe(true);
    expect(employees.companyId.notNull).toBe(true);
    expect(banks.code.notNull).toBe(true);
    expect(taxRules.companyId.notNull).toBe(true);
    expect(companies.code.notNull).toBe(true);
  });

  it("enforces multi-company membership and unique constraints", () => {
    expect(userCompanyMemberships.userId.notNull).toBe(true);
    expect(userCompanyMemberships.companyId.notNull).toBe(true);
    expect(userCompanyMemberships.siteAccessScope.notNull).toBe(true);

    const companyMembershipConfig = getTableConfig(userCompanyMemberships);
    const hasUserCompanyUnique = companyMembershipConfig.indexes.some(
      (idx) => idx.config.name === "user_company_memberships_user_company_unique",
    );
    expect(hasUserCompanyUnique).toBe(true);

    const hasIdCompanyUnique = companyMembershipConfig.indexes.some(
      (idx) => idx.config.name === "user_company_memberships_id_company_unique",
    );
    expect(hasIdCompanyUnique).toBe(true);

    const sitesConfig = getTableConfig(sites);
    const hasSitesIdCompanyUnique = sitesConfig.indexes.some(
      (idx) => idx.config.name === "sites_id_company_unique",
    );
    expect(hasSitesIdCompanyUnique).toBe(true);
  });

  it("enforces static CHECK constraints for scopes and statuses", () => {
    const companyMembershipConfig = getTableConfig(userCompanyMemberships);
    const companyChecks = companyMembershipConfig.checks;

    expect(
      companyChecks.some((c) => c.name === "user_company_memberships_scope_check"),
    ).toBe(true);
    expect(
      companyChecks.some((c) => c.name === "user_company_memberships_status_check"),
    ).toBe(true);

    const siteMembershipConfig = getTableConfig(userSiteMemberships);
    const siteChecks = siteMembershipConfig.checks;

    expect(
      siteChecks.some((c) => c.name === "user_site_memberships_status_check"),
    ).toBe(true);
  });

  it("generates SQL with CHECK constraints", () => {
    const migrationPath = path.join(
      process.cwd(),
      "drizzle",
      "0004_last_stellaris.sql",
    );
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");
    expect(sqlContent).toContain(
      `CONSTRAINT "user_company_memberships_scope_check" CHECK ("user_company_memberships"."site_access_scope" IN ('all_sites', 'selected_sites'))`,
    );
    expect(sqlContent).toContain(
      `CONSTRAINT "user_company_memberships_status_check" CHECK ("user_company_memberships"."status" IN ('active', 'inactive'))`,
    );
    expect(sqlContent).toContain(
      `CONSTRAINT "user_site_memberships_status_check" CHECK ("user_site_memberships"."status" IN ('active', 'inactive'))`,
    );
  });

  it("enforces site membership unique constraints and composite foreign keys", () => {
    expect(userSiteMemberships.companyMembershipId.notNull).toBe(true);
    expect(userSiteMemberships.companyId.notNull).toBe(true);
    expect(userSiteMemberships.siteId.notNull).toBe(true);

    const siteMembershipConfig = getTableConfig(userSiteMemberships);

    const hasMembershipSiteUnique = siteMembershipConfig.indexes.some(
      (idx) => idx.config.name === "user_site_memberships_membership_site_unique",
    );
    expect(hasMembershipSiteUnique).toBe(true);

    const fks = siteMembershipConfig.foreignKeys;
    const companyFk = fks.find(
      (fk) => fk.getName() === "user_site_memberships_company_fk",
    );
    expect(companyFk).toBeDefined();

    const companyFkRef = companyFk!.reference();
    expect(companyFkRef.columns.map((c) => c.name)).toEqual([
      userSiteMemberships.companyMembershipId.name,
      userSiteMemberships.companyId.name,
    ]);
    expect(companyFkRef.foreignColumns.map((c) => c.name)).toEqual([
      userCompanyMemberships.id.name,
      userCompanyMemberships.companyId.name,
    ]);

    const siteFk = fks.find((fk) => fk.getName() === "user_site_memberships_site_fk");
    expect(siteFk).toBeDefined();

    const siteFkRef = siteFk!.reference();
    expect(siteFkRef.columns.map((c) => c.name)).toEqual([
      userSiteMemberships.siteId.name,
      userSiteMemberships.companyId.name,
    ]);
    expect(siteFkRef.foreignColumns.map((c) => c.name)).toEqual([
      sites.id.name,
      sites.companyId.name,
    ]);
  });
});
