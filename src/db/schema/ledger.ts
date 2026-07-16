import {
  date,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  companies,
  contracts,
  costCategories,
  paymentParties,
  sites,
  taxRules,
  vendors,
  workers,
} from "./master-data";
import { users } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const costEntries = pgTable(
  "cost_entries",
  {
    id: uuid("id").primaryKey(),
    entryNumber: varchar("entry_number", { length: 40 }).notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    contractId: uuid("contract_id").references(() => contracts.id),
    costCategoryId: uuid("cost_category_id")
      .notNull()
      .references(() => costCategories.id),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    workerId: uuid("worker_id").references(() => workers.id),
    paymentPartyId: uuid("payment_party_id").references(() => paymentParties.id),
    taxRuleId: uuid("tax_rule_id").references(() => taxRules.id),
    occurredOn: date("occurred_on").notNull(),
    itemName: varchar("item_name", { length: 200 }).notNull(),
    description: text("description"),
    specification: varchar("specification", { length: 200 }),
    quantity: numeric("quantity", { precision: 18, scale: 4 }),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }),
    supplyAmount: numeric("supply_amount", { precision: 18, scale: 2 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
    entryStatus: varchar("entry_status", { length: 20 }).notNull().default("DRAFT"),
    sourceType: varchar("source_type", { length: 20 }).notNull().default("manual"),
    sourceReference: varchar("source_reference", { length: 200 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cost_entries_company_entry_number_unique").on(
      t.companyId,
      t.entryNumber,
    ),
    uniqueIndex("cost_entries_duplicate_candidate_unique").on(
      t.companyId,
      t.siteId,
      t.occurredOn,
      t.itemName,
      t.supplyAmount,
    ),
  ],
);

export const costEntryAuditLogs = pgTable("cost_entry_audit_logs", {
  id: uuid("id").primaryKey(),
  costEntryId: uuid("cost_entry_id")
    .notNull()
    .references(() => costEntries.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: varchar("action", { length: 20 }).notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const ledgerDrafts = pgTable("ledger_drafts", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 120 }).notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    preferenceKey: varchar("preference_key", { length: 100 }).notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_preferences_user_key_unique").on(t.userId, t.preferenceKey),
  ],
);
export const inputTemplates = pgTable(
  "input_templates",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: varchar("name", { length: 120 }).notNull(),
    payload: jsonb("payload").notNull(),
    active: varchar("active", { length: 10 }).notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("input_templates_company_name_unique").on(t.companyId, t.name)],
);
