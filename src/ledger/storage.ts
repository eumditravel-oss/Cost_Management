import { LedgerRow, normalizeItemName } from "./review";

export const STORAGE_KEY_DRAFT = "cost-ledger-draft-v2";
export const STORAGE_KEY_TEMPLATES = "cost-ledger-templates-v1";
export const STORAGE_KEY_RECENT_ITEMS = "cost-ledger-recent-items-v1";

// ---------------------------
// Helpers
// ---------------------------
function sanitizeRows(rows: unknown): LedgerRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .map((r) => ({
      occurredOn: String(r.occurredOn || ""),
      itemName: String(r.itemName || ""),
      quantity: String(r.quantity || ""),
      unitPrice: String(r.unitPrice || ""),
      supplyAmount: String(r.supplyAmount || ""),
      taxRate: String(r.taxRate || ""),
      isManualTax: r.isManualTax === true,
      taxAmount: String(r.taxAmount || ""),
      totalAmount: String(r.totalAmount || "0.00"),
      description: String(r.description || ""),
    }));
}

function hasMeaningfulInput(rows: LedgerRow[]): boolean {
  return rows.some(
    (r) => r.occurredOn || r.itemName || r.supplyAmount || r.description,
  );
}

// ---------------------------
// Draft Management
// ---------------------------
export type DraftState = {
  rows: LedgerRow[];
  companyId: string;
  siteId: string;
  categoryId: string;
  timestamp: number;
};

export function saveDraft(state: DraftState): void {
  try {
    if (!hasMeaningfulInput(state.rows)) {
      clearDraft();
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(state));
  } catch {
    // Ignore quota errors or disabled localStorage
  }
}

export function loadDraft(): DraftState | null {
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_KEY_DRAFT);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.rows)) {
        const rows = sanitizeRows(parsed.rows);
        if (hasMeaningfulInput(rows)) {
          return {
            companyId: String(parsed.companyId || ""),
            siteId: String(parsed.siteId || ""),
            categoryId: String(parsed.categoryId || ""),
            timestamp: Number(parsed.timestamp) || Date.now(),
            rows,
          };
        }
      }
    }

    // Fallback and migrate from V1
    const rawV1 = window.localStorage.getItem("cost-ledger-draft-v1");
    if (rawV1) {
      const parsedV1 = JSON.parse(rawV1);
      if (Array.isArray(parsedV1)) {
        const rows = sanitizeRows(parsedV1);
        if (hasMeaningfulInput(rows)) {
          const v2State: DraftState = {
            rows,
            companyId: "",
            siteId: "",
            categoryId: "",
            timestamp: Date.now(),
          };
          saveDraft(v2State); // Migrate to V2
          window.localStorage.removeItem("cost-ledger-draft-v1"); // Cleanup V1
          return v2State;
        }
      }
      window.localStorage.removeItem("cost-ledger-draft-v1");
    }

    return null;
  } catch {
    return null; // Ignore corrupted JSON
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY_DRAFT);
  } catch {
    // Ignore
  }
}

// ---------------------------
// Template Management
// ---------------------------
export type Template = {
  id: string;
  name: string;
  companyId: string;
  siteId: string;
  categoryId: string;
  rows: LedgerRow[];
};

export function getTemplates(): Template[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TEMPLATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t: unknown): t is Record<string, unknown> =>
          t !== null && typeof t === "object" && "id" in t && "name" in t,
      )
      .map((t) => ({
        id: String(t.id),
        name: String(t.name),
        companyId: String(t.companyId || ""),
        siteId: String(t.siteId || ""),
        categoryId: String(t.categoryId || ""),
        rows: sanitizeRows(t.rows),
      }));
  } catch {
    return [];
  }
}

export function saveTemplate(template: Template): void {
  try {
    const templates = getTemplates();
    const existingIndex = templates.findIndex((t) => t.id === template.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push(template);
    }
    window.localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
  } catch {
    // Ignore
  }
}

export function renameTemplate(id: string, newName: string): void {
  try {
    const templates = getTemplates();
    const t = templates.find((x) => x.id === id);
    if (t) {
      t.name = newName;
      window.localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
    }
  } catch {
    // Ignore
  }
}

export function deleteTemplate(id: string): void {
  try {
    const templates = getTemplates().filter((t) => t.id !== id);
    window.localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
  } catch {
    // Ignore
  }
}

// ---------------------------
// Recent Items Management
// ---------------------------
const MAX_RECENT_ITEMS = 100;

export function getRecentItems(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_RECENT_ITEMS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const valid = parsed.filter((i) => typeof i === "string" && i.trim() !== "");
    const seen = new Set<string>();
    const deduplicated: string[] = [];

    for (const item of valid) {
      const normalized = normalizeItemName(item);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduplicated.push(item);
      }
    }
    return deduplicated.slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

export function addRecentItems(newItems: string[]): string[] {
  try {
    const current = getRecentItems();
    const itemsToAdd = newItems.filter((i) => typeof i === "string" && i.trim() !== "");

    // Combine and deduplicate based on normalized name, keeping the latest entered format
    const all = [...itemsToAdd.reverse(), ...current];
    const seen = new Set<string>();
    const deduplicated: string[] = [];

    for (const item of all) {
      const normalized = normalizeItemName(item);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduplicated.push(item);
      }
    }

    const limited = deduplicated.slice(0, MAX_RECENT_ITEMS);
    window.localStorage.setItem(STORAGE_KEY_RECENT_ITEMS, JSON.stringify(limited));
    return limited;
  } catch {
    return [];
  }
}

export function parseExcelPaste(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));
}

export function isExcelPasteRange(matrix: string[][]): boolean {
  if (matrix.length === 0) return false;
  return matrix.length > 1 || matrix[0].length > 1;
}
