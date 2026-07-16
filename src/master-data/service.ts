import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createDatabase } from "@/db/client";
import {
  banks,
  companies,
  contracts,
  employees,
  costCategories,
  masterDataAuditLogs,
  paymentParties,
  sites,
  taxRules,
  vendors,
  workers,
} from "@/db/schema";

export const masterEntities = [
  "banks",
  "companies",
  "sites",
  "contracts",
  "cost-categories",
  "vendors",
  "employees",
  "workers",
  "payment-parties",
  "tax-rules",
] as const;

export type MasterEntity = (typeof masterEntities)[number];

const recordState = z.enum(["active", "inactive"]);
const code = z.string().trim().min(1).max(40);
const name = z.string().trim().min(1).max(160);
const id = z.uuid();
const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();
const dateValue = z
  .string()
  .trim()
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .nullable()
  .optional();

const companyInput = z.object({ code, name, active: recordState.default("active") });
const siteInput = companyInput.extend({ companyId: id });
const contractInput = z.object({
  companyId: id,
  siteId: id,
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,16}(?:\.\d{1,2})?$/)
    .nullable()
    .optional(),
  startsOn: dateValue,
  endsOn: dateValue,
  status: recordState.default("active"),
});
const costCategoryInput = companyInput.extend({
  companyId: id,
  parentId: id.nullable().optional(),
  name: z.string().trim().min(1).max(100),
});
const vendorInput = companyInput.extend({
  companyId: id,
  businessNumber: optionalText(30),
});
const workerInput = z.object({
  companyId: id,
  code,
  displayName: z.string().trim().min(1).max(100),
  trade: optionalText(100),
  active: recordState.default("active"),
});
const employeeInput = z.object({
  companyId: id,
  code,
  displayName: z.string().trim().min(1).max(100),
  department: optionalText(100),
  active: recordState.default("active"),
});
const bankInput = companyInput;
const paymentPartyInput = companyInput.extend({ companyId: id });
const taxRuleInput = companyInput.extend({
  companyId: id,
  name: z.string().trim().min(1).max(100),
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,3}(?:\.\d{1,4})?$/),
});

const inputSchemas = {
  banks: bankInput,
  companies: companyInput,
  sites: siteInput,
  contracts: contractInput,
  "cost-categories": costCategoryInput,
  vendors: vendorInput,
  employees: employeeInput,
  workers: workerInput,
  "payment-parties": paymentPartyInput,
  "tax-rules": taxRuleInput,
} as const;

type BankInput = z.infer<typeof bankInput>;
type CompanyInput = z.infer<typeof companyInput>;
type SiteInput = z.infer<typeof siteInput>;
type ContractInput = z.infer<typeof contractInput>;
type CostCategoryInput = z.infer<typeof costCategoryInput>;
type VendorInput = z.infer<typeof vendorInput>;
type EmployeeInput = z.infer<typeof employeeInput>;
type WorkerInput = z.infer<typeof workerInput>;
type PaymentPartyInput = z.infer<typeof paymentPartyInput>;
type TaxRuleInput = z.infer<typeof taxRuleInput>;
type MasterDataInput =
  | BankInput
  | CompanyInput
  | SiteInput
  | ContractInput
  | CostCategoryInput
  | VendorInput
  | EmployeeInput
  | WorkerInput
  | PaymentPartyInput
  | TaxRuleInput;

export class MasterDataValidationError extends Error {
  constructor(readonly fields: string[]) {
    super("MASTER_DATA_VALIDATION_ERROR");
  }
}

export function isMasterEntity(value: string): value is MasterEntity {
  return (masterEntities as readonly string[]).includes(value);
}

export function parseMasterDataInput(entity: MasterEntity, value: unknown) {
  const result = inputSchemas[entity].safeParse(value);
  if (!result.success) {
    throw new MasterDataValidationError(
      result.error.issues.map((issue) => issue.path.join(".") || "request"),
    );
  }
  return result.data as MasterDataInput;
}

export function parseMasterDataPatch(entity: MasterEntity, value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    throw new MasterDataValidationError(["request"]);
  }
  const result = inputSchemas[entity].partial().safeParse(value);
  if (!result.success) {
    throw new MasterDataValidationError(
      result.error.issues.map((issue) => issue.path.join(".") || "request"),
    );
  }
  const patch = Object.fromEntries(
    Object.keys(value).flatMap((key) =>
      key in result.data ? [[key, result.data[key as keyof typeof result.data]]] : [],
    ),
  );
  if (Object.keys(patch).length === 0) throw new MasterDataValidationError(["request"]);
  return patch;
}

function toDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function auditSummary(value: Record<string, unknown> | null) {
  if (!value) return null;
  const state = value.active ?? value.status;
  return JSON.stringify({ fields: Object.keys(value).sort(), state });
}

function auditValues(
  actorUserId: string,
  entity: MasterEntity,
  entityId: string,
  action: "create" | "update",
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) {
  return {
    id: crypto.randomUUID(),
    actorUserId,
    entityType: entity,
    entityId,
    action,
    beforeValue: auditSummary(before),
    afterValue: auditSummary(after),
  };
}

async function requireRelatedRecords(
  entity: MasterEntity,
  input: MasterDataInput,
  currentId?: string,
) {
  const { client, database } = createDatabase();
  try {
    if (entity === "contracts") {
      const contract = input as ContractInput;
      const site = await database
        .select({ id: sites.id })
        .from(sites)
        .where(
          and(eq(sites.id, contract.siteId), eq(sites.companyId, contract.companyId)),
        )
        .limit(1);
      if (!site[0]) throw new MasterDataValidationError(["siteId"]);
    }
    if (entity === "cost-categories") {
      const category = input as CostCategoryInput;
      if (!category.parentId) return;
      if (category.parentId === currentId)
        throw new MasterDataValidationError(["parentId"]);
      const parent = await database
        .select({ id: costCategories.id })
        .from(costCategories)
        .where(
          and(
            eq(costCategories.id, category.parentId),
            eq(costCategories.companyId, category.companyId),
          ),
        )
        .limit(1);
      if (!parent[0]) throw new MasterDataValidationError(["parentId"]);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function listMasterData(entity: MasterEntity, companyId?: string) {
  const { client, database } = createDatabase();
  try {
    switch (entity) {
      case "banks":
        return database.select().from(banks).orderBy(asc(banks.code)).limit(200);
      case "banks":
        return database.select().from(banks).orderBy(asc(banks.code)).limit(200);
      case "companies":
        return database
          .select()
          .from(companies)
          .orderBy(asc(companies.code))
          .limit(200);
      case "sites":
        return companyId
          ? database
              .select()
              .from(sites)
              .where(eq(sites.companyId, companyId))
              .orderBy(asc(sites.code))
              .limit(200)
          : [];
      case "contracts":
        return companyId
          ? database
              .select()
              .from(contracts)
              .where(eq(contracts.companyId, companyId))
              .orderBy(asc(contracts.code))
              .limit(200)
          : [];
      case "cost-categories":
        return companyId
          ? database
              .select()
              .from(costCategories)
              .where(eq(costCategories.companyId, companyId))
              .orderBy(asc(costCategories.code))
              .limit(200)
          : [];
      case "vendors":
        return companyId
          ? database
              .select()
              .from(vendors)
              .where(eq(vendors.companyId, companyId))
              .orderBy(asc(vendors.code))
              .limit(200)
          : [];
      case "employees":
        return companyId
          ? database
              .select()
              .from(employees)
              .where(eq(employees.companyId, companyId))
              .orderBy(asc(employees.code))
              .limit(200)
          : [];
      case "workers":
      case "employees":
        return companyId
          ? database
              .select()
              .from(employees)
              .where(eq(employees.companyId, companyId))
              .orderBy(asc(employees.code))
              .limit(200)
          : [];
      case "workers":
        return companyId
          ? database
              .select()
              .from(workers)
              .where(eq(workers.companyId, companyId))
              .orderBy(asc(workers.code))
              .limit(200)
          : [];
      case "payment-parties":
        return companyId
          ? database
              .select()
              .from(paymentParties)
              .where(eq(paymentParties.companyId, companyId))
              .orderBy(asc(paymentParties.code))
              .limit(200)
          : [];
      case "tax-rules":
        return companyId
          ? database
              .select()
              .from(taxRules)
              .where(eq(taxRules.companyId, companyId))
              .orderBy(asc(taxRules.code))
              .limit(200)
          : [];
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function createMasterData(
  entity: MasterEntity,
  input: MasterDataInput,
  actorUserId: string,
) {
  await requireRelatedRecords(entity, input);
  const { client, database } = createDatabase();
  try {
    return await database.transaction(async (tx) => {
      switch (entity) {
        case "banks": {
          const value = input as BankInput;
          const [row] = await tx
            .insert(banks)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "banks": {
          const value = input as BankInput;
          const [row] = await tx
            .insert(banks)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "companies": {
          const value = input as CompanyInput;
          const [row] = await tx
            .insert(companies)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "sites": {
          const value = input as SiteInput;
          const [row] = await tx
            .insert(sites)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "contracts": {
          const value = input as ContractInput;
          const [row] = await tx
            .insert(contracts)
            .values({
              id: crypto.randomUUID(),
              ...value,
              startsOn: toDate(value.startsOn),
              endsOn: toDate(value.endsOn),
            })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "cost-categories": {
          const value = input as CostCategoryInput;
          const [row] = await tx
            .insert(costCategories)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "vendors": {
          const value = input as VendorInput;
          const [row] = await tx
            .insert(vendors)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "employees": {
          const value = input as EmployeeInput;
          const [row] = await tx
            .insert(employees)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "workers":
        case "employees": {
          const value = input as EmployeeInput;
          const [row] = await tx
            .insert(employees)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "workers": {
          const value = input as WorkerInput;
          const [row] = await tx
            .insert(workers)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "payment-parties": {
          const value = input as PaymentPartyInput;
          const [row] = await tx
            .insert(paymentParties)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
        case "tax-rules": {
          const value = input as TaxRuleInput;
          const [row] = await tx
            .insert(taxRules)
            .values({ id: crypto.randomUUID(), ...value })
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "create", null, row));
          return row;
        }
      }
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function findMasterData(entity: MasterEntity, recordId: string) {
  const { client, database } = createDatabase();
  try {
    switch (entity) {
      case "banks":
        return database.query.banks.findFirst({ where: eq(banks.id, recordId) });
      case "banks":
        return database.query.banks.findFirst({ where: eq(banks.id, recordId) });
      case "companies":
        return database.query.companies.findFirst({
          where: eq(companies.id, recordId),
        });
      case "sites":
        return database.query.sites.findFirst({ where: eq(sites.id, recordId) });
      case "contracts":
        return database.query.contracts.findFirst({
          where: eq(contracts.id, recordId),
        });
      case "cost-categories":
        return database.query.costCategories.findFirst({
          where: eq(costCategories.id, recordId),
        });
      case "vendors":
        return database.query.vendors.findFirst({ where: eq(vendors.id, recordId) });
      case "employees":
        return database.query.employees.findFirst({
          where: eq(employees.id, recordId),
        });
      case "workers":
      case "employees":
        return database.query.employees.findFirst({
          where: eq(employees.id, recordId),
        });
      case "workers":
        return database.query.workers.findFirst({ where: eq(workers.id, recordId) });
      case "payment-parties":
        return database.query.paymentParties.findFirst({
          where: eq(paymentParties.id, recordId),
        });
      case "tax-rules":
        return database.query.taxRules.findFirst({ where: eq(taxRules.id, recordId) });
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

function existingAsInput(entity: MasterEntity, row: Record<string, unknown>) {
  const date = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value;
  switch (entity) {
    case "banks":
      return { code: row.code, name: row.name, active: row.active };
    case "banks":
      return { code: row.code, name: row.name, active: row.active };
    case "companies":
      return { code: row.code, name: row.name, active: row.active };
    case "sites":
      return {
        companyId: row.companyId,
        code: row.code,
        name: row.name,
        active: row.active,
      };
    case "contracts":
      return {
        companyId: row.companyId,
        siteId: row.siteId,
        code: row.code,
        name: row.name,
        amount: row.amount,
        startsOn: date(row.startsOn),
        endsOn: date(row.endsOn),
        status: row.status,
      };
    case "cost-categories":
      return {
        companyId: row.companyId,
        parentId: row.parentId,
        code: row.code,
        name: row.name,
        active: row.active,
      };
    case "vendors":
      return {
        companyId: row.companyId,
        code: row.code,
        name: row.name,
        businessNumber: row.businessNumber,
        active: row.active,
      };
    case "employees":
      return {
        companyId: row.companyId,
        code: row.code,
        displayName: row.displayName,
        department: row.department,
        active: row.active,
      };
    case "workers":
    case "employees":
      return {
        companyId: row.companyId,
        code: row.code,
        displayName: row.displayName,
        department: row.department,
        active: row.active,
      };
    case "workers":
      return {
        companyId: row.companyId,
        code: row.code,
        displayName: row.displayName,
        trade: row.trade,
        active: row.active,
      };
    case "payment-parties":
      return {
        companyId: row.companyId,
        code: row.code,
        name: row.name,
        active: row.active,
      };
    case "tax-rules":
      return {
        companyId: row.companyId,
        code: row.code,
        name: row.name,
        rate: row.rate,
        active: row.active,
      };
  }
}

export async function updateMasterData(
  entity: MasterEntity,
  recordId: string,
  patch: Record<string, unknown>,
  actorUserId: string,
) {
  const current = await findMasterData(entity, recordId);
  if (!current) return null;
  const merged = parseMasterDataInput(entity, {
    ...existingAsInput(entity, current as Record<string, unknown>),
    ...patch,
  });
  await requireRelatedRecords(entity, merged, recordId);
  const { client, database } = createDatabase();
  try {
    return await database.transaction(async (tx) => {
      const updatedAt = new Date();
      switch (entity) {
        case "banks": {
          const value = merged as BankInput;
          const [row] = await tx
            .update(banks)
            .set({ ...value, updatedAt })
            .where(eq(banks.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "banks": {
          const value = merged as BankInput;
          const [row] = await tx
            .update(banks)
            .set({ ...value, updatedAt })
            .where(eq(banks.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "companies": {
          const value = merged as CompanyInput;
          const [row] = await tx
            .update(companies)
            .set({ ...value, updatedAt })
            .where(eq(companies.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "sites": {
          const value = merged as SiteInput;
          const [row] = await tx
            .update(sites)
            .set({ ...value, updatedAt })
            .where(eq(sites.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "contracts": {
          const value = merged as ContractInput;
          const [row] = await tx
            .update(contracts)
            .set({
              ...value,
              startsOn: toDate(value.startsOn),
              endsOn: toDate(value.endsOn),
              updatedAt,
            })
            .where(eq(contracts.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "cost-categories": {
          const value = merged as CostCategoryInput;
          const [row] = await tx
            .update(costCategories)
            .set({ ...value, updatedAt })
            .where(eq(costCategories.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "vendors": {
          const value = merged as VendorInput;
          const [row] = await tx
            .update(vendors)
            .set({ ...value, updatedAt })
            .where(eq(vendors.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "employees": {
          const value = merged as EmployeeInput;
          const [row] = await tx
            .update(employees)
            .set({ ...value, updatedAt })
            .where(eq(employees.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "workers":
        case "employees": {
          const value = merged as EmployeeInput;
          const [row] = await tx
            .update(employees)
            .set({ ...value, updatedAt })
            .where(eq(employees.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "workers": {
          const value = merged as WorkerInput;
          const [row] = await tx
            .update(workers)
            .set({ ...value, updatedAt })
            .where(eq(workers.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "payment-parties": {
          const value = merged as PaymentPartyInput;
          const [row] = await tx
            .update(paymentParties)
            .set({ ...value, updatedAt })
            .where(eq(paymentParties.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
        case "tax-rules": {
          const value = merged as TaxRuleInput;
          const [row] = await tx
            .update(taxRules)
            .set({ ...value, updatedAt })
            .where(eq(taxRules.id, recordId))
            .returning();
          await tx
            .insert(masterDataAuditLogs)
            .values(auditValues(actorUserId, entity, row.id, "update", current, row));
          return row;
        }
      }
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export function isDatabaseConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "23503" || error.code === "23505")
  );
}
