import { describe, it, expect, beforeEach } from "vitest";
import {
  saveDraft,
  loadDraft,
  clearDraft,
  STORAGE_KEY_DRAFT,
  saveTemplate,
  getTemplates,
  deleteTemplate,
  renameTemplate,
  STORAGE_KEY_TEMPLATES,
  addRecentItems,
  getRecentItems,
  STORAGE_KEY_RECENT_ITEMS,
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
    it("saveDraft and loadDraft work correctly for meaningful data", () => {
      const state = {
        rows: [{ occurredOn: "2023-01-01", itemName: "A" } as unknown as LedgerRow],
        companyId: "c1",
        siteId: "s1",
        categoryId: "cat1",
        timestamp: 123456,
      };
      saveDraft(state);
      const loaded = loadDraft();
      expect(loaded?.rows[0].itemName).toBe("A");
    });

    it("prevents saving empty drafts", () => {
      saveDraft({
        rows: [{} as unknown as LedgerRow],
        companyId: "",
        siteId: "",
        categoryId: "",
        timestamp: 0,
      });
      expect(loadDraft()).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY_DRAFT)).toBeNull();
    });

    it("loadDraft safely migrates V1 to V2 only if meaningful", () => {
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

    it("loadDraft drops meaningless V1 drafts", () => {
      window.localStorage.setItem("cost-ledger-draft-v1", JSON.stringify([{}]));
      expect(loadDraft()).toBeNull();
      expect(window.localStorage.getItem("cost-ledger-draft-v1")).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY_DRAFT)).toBeNull();
    });

    it("loadDraft safely sanitizes incorrect row structures", () => {
      window.localStorage.setItem(
        STORAGE_KEY_DRAFT,
        JSON.stringify({
          rows: ["not a row object", { itemName: 123 }],
          companyId: "c1",
        }),
      );
      const state = loadDraft();
      expect(state).toBeTruthy();
      expect(state?.rows).toHaveLength(1); // the object one is preserved, string ignored
      expect(state?.rows[0].itemName).toBe("123"); // converted to string
    });

    it("loadDraft returns null for corrupted JSON safely", () => {
      window.localStorage.setItem(STORAGE_KEY_DRAFT, "{ invalid json");
      expect(loadDraft()).toBeNull();
    });

    it("clearDraft removes the draft", () => {
      saveDraft({
        rows: [{ itemName: "A" } as unknown as LedgerRow],
        companyId: "",
        siteId: "",
        categoryId: "",
        timestamp: 0,
      });
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
      expect(getTemplates()).toHaveLength(1);
    });

    it("renameTemplate renames a template", () => {
      saveTemplate({
        id: "1",
        name: "T1",
        companyId: "",
        siteId: "",
        categoryId: "",
        rows: [],
      });
      renameTemplate("1", "T1 Renamed");
      expect(getTemplates()[0].name).toBe("T1 Renamed");
    });

    it("deleteTemplate removes a template", () => {
      saveTemplate({
        id: "2",
        name: "T2",
        companyId: "",
        siteId: "",
        categoryId: "",
        rows: [],
      });
      deleteTemplate("2");
      expect(getTemplates().find((t) => t.id === "2")).toBeUndefined();
    });

    it("ignores corrupted JSON for templates and sanitizes types", () => {
      window.localStorage.setItem(
        STORAGE_KEY_TEMPLATES,
        JSON.stringify([
          { id: "1" }, // missing name
          { id: "2", name: "ok", rows: [123] }, // wrong row type
        ]),
      );
      const templates = getTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe("2");
      expect(templates[0].rows).toEqual([]);
    });
  });

  describe("Recent Items Management", () => {
    it("addRecentItems filters empty strings and adds to list", () => {
      addRecentItems(["Apple", "   ", "Banana"]);
      const recent = getRecentItems();
      expect(recent).toEqual(["Banana", "Apple"]);
    });

    it("sanitizes wrong types in recent items", () => {
      window.localStorage.setItem(
        STORAGE_KEY_RECENT_ITEMS,
        JSON.stringify(["Apple", 123, null]),
      );
      const recent = getRecentItems();
      expect(recent).toEqual(["Apple"]);
    });

    it("addRecentItems deduplicates using normalized form, keeping latest display string", () => {
      addRecentItems(["Apple", "Banana"]);
      addRecentItems(["aPple ", "Cherry"]);

      const recent = getRecentItems();
      expect(recent).toEqual(["Cherry", "aPple ", "Banana"]);
    });

    it("enforces MAX_RECENT_ITEMS limit of 100", () => {
      const items = Array.from({ length: 110 }, (_, i) => `Item ${i}`);
      addRecentItems(items);
      const recent = getRecentItems();
      expect(recent).toHaveLength(100);
      expect(recent[0]).toBe("Item 109");
      expect(recent[99]).toBe("Item 10");
    });
  });
});
