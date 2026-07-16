import {
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

const created = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("companies_code_unique").on(t.code)],
);
export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("sites_company_code_unique").on(t.companyId, t.code)],
);
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    startsOn: timestamp("starts_on", { withTimezone: true }),
    endsOn: timestamp("ends_on", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("contracts_company_code_unique").on(t.companyId, t.code)],
);
export const costCategories = pgTable(
  "cost_categories",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    parentId: uuid("parent_id"),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("cost_categories_company_code_unique").on(t.companyId, t.code)],
);
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    businessNumber: varchar("business_number", { length: 30 }),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("vendors_company_code_unique").on(t.companyId, t.code)],
);
export const workers = pgTable(
  "workers",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    code: varchar("code", { length: 40 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    trade: varchar("trade", { length: 100 }),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("workers_company_code_unique").on(t.companyId, t.code)],
);
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    code: varchar("code", { length: 40 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    department: varchar("department", { length: 100 }),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("employees_company_code_unique").on(t.companyId, t.code)],
);
export const banks = pgTable(
  "banks",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("banks_code_unique").on(t.code)],
);
export const paymentParties = pgTable(
  "payment_parties",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("payment_parties_company_code_unique").on(t.companyId, t.code)],
);
export const taxRules = pgTable(
  "tax_rules",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    rate: numeric("rate", { precision: 7, scale: 4 }).notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    ...created,
  },
  (t) => [uniqueIndex("tax_rules_company_code_unique").on(t.companyId, t.code)],
);
export const masterDataAuditLogs = pgTable("master_data_audit_logs", {
  id: uuid("id").primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
