import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT, DELETE } from "./[preferenceKey]/route";
import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";
import { checkUserSiteAccess } from "@/ledger/permissions";
import { createDatabase } from "@/db/client";

vi.mock("@/auth/identity");
vi.mock("@/auth/authorization");
const mockEnd = vi.fn();

vi.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {};
  db.select = vi.fn(() => db);
  db.from = vi.fn(() => db);
  db.where = vi.fn().mockResolvedValue([]);
  db.insert = vi.fn(() => db);
  db.values = vi.fn(() => db);
  db.onConflictDoUpdate = vi.fn().mockResolvedValue([]);
  db.delete = vi.fn(() => db);

  return {
    createDatabase: vi.fn(() => ({
      client: { end: mockEnd },
      database: db,
    })),
  };
});
vi.mock("@/ledger/permissions");

describe("Ledger Preferences API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnd.mockClear();
  });

  describe("Authentication and Authorization", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue(null);
      const res = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 if no ledger.read permission", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(false);
      const res = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Validation", () => {
    it("returns 400 for unknown preferenceKey", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      const res = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ preferenceKey: "unknown.key" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid saved_filters payload", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ version: 2 }), // invalid version
      });
      const res = await PUT(req, {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(400);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 403 if user lacks scope for filter", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      vi.mocked(checkUserSiteAccess).mockResolvedValue({
        allowed: false,
        error: "SCOPE_FORBIDDEN",
      });

      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          version: 1,
          filters: [
            {
              id: "123e4567-e89b-12d3-a456-426614174000",
              name: "Filter",
              companyId: "123e4567-e89b-12d3-a456-426614174001",
              query: {},
            },
          ],
        }),
      });
      const res = await PUT(req, {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(403);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 200 on successful save", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      vi.mocked(checkUserSiteAccess).mockResolvedValue({
        allowed: true,
        allowedSiteIds: null,
      });

      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          version: 1,
          filters: [
            {
              id: "123e4567-e89b-12d3-a456-426614174000",
              name: "Filter",
              companyId: "123e4567-e89b-12d3-a456-426614174001",
              query: {},
            },
          ],
        }),
      });
      const res = await PUT(req, {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(200);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 200 and { preference: null } if no preference found", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      const res = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ preference: null });
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 200 and { preference: validPreference } if found", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDatabase = (createDatabase() as any).database;
      mockDatabase.where.mockResolvedValueOnce([
        {
          value: {
            version: 1,
            filters: [],
          },
        },
      ]);

      const res = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ preference: { version: 1, filters: [] } });
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 400 if costCategoryId is invalid for company", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      vi.mocked(checkUserSiteAccess).mockResolvedValue({
        allowed: true,
        allowedSiteIds: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDatabase = (createDatabase() as any).database;
      // mock where returning [] for costCategories
      mockDatabase.where.mockResolvedValueOnce([]);

      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          version: 1,
          filters: [
            {
              id: "123e4567-e89b-12d3-a456-426614174000",
              name: "Filter",
              companyId: "123e4567-e89b-12d3-a456-426614174001",
              query: {
                costCategoryId: "123e4567-e89b-12d3-a456-426614174002",
              },
            },
          ],
        }),
      });
      const res = await PUT(req, {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(400);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 200 on successful save with valid costCategoryId", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      vi.mocked(checkUserSiteAccess).mockResolvedValue({
        allowed: true,
        allowedSiteIds: null,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDatabase = (createDatabase() as any).database;
      // mock where returning valid category
      mockDatabase.where.mockResolvedValueOnce([
        { id: "123e4567-e89b-12d3-a456-426614174002" },
      ]);

      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          version: 1,
          filters: [
            {
              id: "123e4567-e89b-12d3-a456-426614174000",
              name: "Filter",
              companyId: "123e4567-e89b-12d3-a456-426614174001",
              query: {
                costCategoryId: "123e4567-e89b-12d3-a456-426614174002",
              },
            },
          ],
        }),
      });
      const res = await PUT(req, {
        params: Promise.resolve({ preferenceKey: "ledger.saved_filters.v1" }),
      });
      expect(res.status).toBe(200);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("returns 200 on successful delete", async () => {
      vi.mocked(getCurrentIdentity).mockResolvedValue({
        userId: "u1",
      } as unknown as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      const res = await DELETE(new Request("http://localhost"), {
        params: Promise.resolve({ preferenceKey: "ledger.list_columns.v1" }),
      });
      expect(res.status).toBe(200);
      expect(mockEnd).toHaveBeenCalled();
    });
  });
});
