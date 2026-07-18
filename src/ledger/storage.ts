import { LedgerRow, normalizeItemName } from "./review";

export const STORAGE_KEY_DRAFT = "cost-ledger-draft-v2";
export const STORAGE_KEY_TEMPLATES = "cost-ledger-templates-v1";
export const STORAGE_KEY_RECENT_ITEMS = "cost-ledger-recent-items-v1";

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
      if (parsed && Array.isArray(parsed.rows)) {
        return parsed as DraftState;
      }
    }

    // Fallback and migrate from V1
    const rawV1 = window.localStorage.getItem("cost-ledger-draft-v1");
    if (rawV1) {
      const parsedV1 = JSON.parse(rawV1);
      if (Array.isArray(parsedV1)) {
        const v2State: DraftState = {
          rows: parsedV1,
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
    return Array.isArray(parsed) ? parsed : [];
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentItems(newItems: string[]): string[] {
  try {
    const current = getRecentItems();
    const itemsToAdd = newItems.filter((i) => i.trim() !== "");

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
