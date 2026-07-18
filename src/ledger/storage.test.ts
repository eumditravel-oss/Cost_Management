import { describe, it, expect, beforeEach } from "vitest";
import {
  saveDraft,
  loadDraft,
  clearDraft,
  STORAGE_KEY_DRAFT,
  saveTemplate,
  getTemplates,
  deleteTemplate,
  STORAGE_KEY_TEMPLATES,
  addRecentItems,
  getRecentItems,
} from "./storage";
import { LedgerRow } from "./review";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: localStorageMock },
});

describe("Storage functions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("Draft Management", () => {
    it("saveDraft and loadDraft work correctly", () => {
      const state = {
        rows: [{ occurredOn: "2023-01-01", itemName: "A" } as unknown as LedgerRow],
        companyId: "c1",
        siteId: "s1",
        categoryId: "cat1",
        timestamp: 123456,
      };
      saveDraft(state);
      expect(loadDraft()).toEqual(state);
    });

    it("loadDraft safely migrates V1 to V2", () => {
      window.localStorage.setItem(
        "cost-ledger-draft-v1",
        JSON.stringify([{ occurredOn: "2022-01-01" }]),
      );
      const state = loadDraft();
      expect(state?.rows[0].occurredOn).toBe("2022-01-01");
      expect(state?.timestamp).toBeGreaterThan(0);
      expect(window.localStorage.getItem("cost-ledger-draft-v1")).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY_DRAFT)).toBeTruthy();
    });

    it("loadDraft returns null for corrupted JSON safely", () => {
      window.localStorage.setItem(STORAGE_KEY_DRAFT, "{ invalid json");
      expect(loadDraft()).toBeNull();
    });

    it("clearDraft removes the draft", () => {
      saveDraft({ rows: [], companyId: "", siteId: "", categoryId: "", timestamp: 0 });
      clearDraft();
      expect(loadDraft()).toBeNull();
    });
  });

  describe("Template Management", () => {
    it("saveTemplate and getTemplates work", () => {
      const t1 = {
        id: "1",
        name: "T1",
        companyId: "c1",
        siteId: "s1",
        categoryId: "cat1",
        rows: [],
      };
      saveTemplate(t1);
      expect(getTemplates()).toEqual([t1]);

      const t2 = {
        id: "2",
        name: "T2",
        companyId: "c1",
        siteId: "s1",
        categoryId: "cat1",
        rows: [],
      };
      saveTemplate(t2);
      expect(getTemplates()).toHaveLength(2);
    });

    it("saveTemplate updates existing if id matches", () => {
      const t1 = {
        id: "1",
        name: "T1",
        companyId: "c1",
        siteId: "s1",
        categoryId: "cat1",
        rows: [],
      };
      saveTemplate(t1);

      const updated = { ...t1, name: "T1 Updated" };
      saveTemplate(updated);

      const templates = getTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("T1 Updated");
    });

    it("deleteTemplate removes template by id", () => {
      saveTemplate({
        id: "1",
        name: "T1",
        companyId: "c1",
        siteId: "s1",
        categoryId: "cat1",
        rows: [],
      });
      deleteTemplate("1");
      expect(getTemplates()).toEqual([]);
    });

    it("ignores corrupted JSON for templates", () => {
      window.localStorage.setItem(STORAGE_KEY_TEMPLATES, "[ invalid json");
      expect(getTemplates()).toEqual([]);
    });
  });

  describe("Recent Items Management", () => {
    it("addRecentItems filters empty strings and adds to list", () => {
      addRecentItems(["Apple", "   ", "Banana"]);
      const recent = getRecentItems();
      expect(recent).toEqual(["Banana", "Apple"]); // Added in reverse order for newest first
    });

    it("addRecentItems deduplicates using normalized form, keeping latest display string", () => {
      addRecentItems(["Apple", "Banana"]);
      addRecentItems(["aPple ", "Cherry"]);

      const recent = getRecentItems();
      // "aPple " replaces "Apple" because they share normalized "apple"
      expect(recent).toEqual(["Cherry", "aPple ", "Banana"]);
    });

    it("enforces MAX_RECENT_ITEMS limit of 100", () => {
      const items = Array.from({ length: 110 }, (_, i) => `Item ${i}`);
      addRecentItems(items);
      const recent = getRecentItems();
      expect(recent).toHaveLength(100);
      // Newest should be Item 109, oldest Item 10
      expect(recent[0]).toBe("Item 109");
      expect(recent[99]).toBe("Item 10");
    });
  });
});
