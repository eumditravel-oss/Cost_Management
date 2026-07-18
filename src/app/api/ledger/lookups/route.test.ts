import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import { getCurrentIdentity } from "@/auth/identity";
import { hasPermission } from "@/auth/authorization";

vi.mock("@/auth/identity");
vi.mock("@/auth/authorization");

const mockEnd = vi.fn();
const mockDatabase = {
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
};

mockDatabase.select.mockReturnValue(mockDatabase);
mockDatabase.from.mockReturnValue(mockDatabase);
mockDatabase.innerJoin.mockReturnValue(mockDatabase);
mockDatabase.where.mockResolvedValue([]);

vi.mock("@/db/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {};
  db.select = vi.fn(() => db);
  db.from = vi.fn(() => db);
  db.innerJoin = vi.fn(() => db);
  db.where = vi.fn().mockResolvedValue([]);

  return {
    createDatabase: vi.fn(() => ({
      client: { end: mockEnd },
      database: db,
    })),
  };
});

import { createDatabase } from "@/db/client";

describe("Ledger Lookups API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnd.mockClear();
  });

  it("returns 401 if unauthenticated", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/ledger/lookups");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 if no ledger.read permission", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(false);
    const req = new NextRequest("http://localhost/api/ledger/lookups");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns user companies if no companyId provided", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (createDatabase() as any).database;
    db.where.mockResolvedValueOnce([{ id: "c1", name: "Company 1" }]);

    const req = new NextRequest("http://localhost/api/ledger/lookups");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      companies: [{ id: "c1", name: "Company 1" }],
    });
  });

  it("returns 400 for invalid companyId UUID", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    const req = new NextRequest(
      "http://localhost/api/ledger/lookups?companyId=invalid-uuid",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 if user lacks membership in company", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (createDatabase() as any).database;
    // user memberships check returns empty
    db.where.mockResolvedValueOnce([]);

    const req = new NextRequest(
      "http://localhost/api/ledger/lookups?companyId=123e4567-e89b-12d3-a456-426614174000",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns sites and costCategories for all_sites scope", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (createDatabase() as any).database;
    db.where
      .mockResolvedValueOnce([{ id: "m1", siteAccessScope: "all_sites" }]) // membership
      .mockResolvedValueOnce([{ id: "s1", name: "Site 1" }]) // sites
      .mockResolvedValueOnce([{ id: "cat1", name: "Cat 1" }]); // categories

    const req = new NextRequest(
      "http://localhost/api/ledger/lookups?companyId=123e4567-e89b-12d3-a456-426614174000",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sites: [{ id: "s1", name: "Site 1" }],
      costCategories: [{ id: "cat1", name: "Cat 1" }],
    });
  });

  it("returns allowed sites and costCategories for selected_sites scope", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (createDatabase() as any).database;
    db.where
      .mockResolvedValueOnce([{ id: "m1", siteAccessScope: "selected_sites" }]) // membership
      .mockResolvedValueOnce([{ id: "s2", name: "Site 2" }]) // sites
      .mockResolvedValueOnce([{ id: "cat1", name: "Cat 1" }]); // categories

    const req = new NextRequest(
      "http://localhost/api/ledger/lookups?companyId=123e4567-e89b-12d3-a456-426614174000",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sites: [{ id: "s2", name: "Site 2" }],
      costCategories: [{ id: "cat1", name: "Cat 1" }],
    });
  });

  it("returns empty sites if selected_sites and no sites allowed", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue({
      userId: "u1",
    } as unknown as never);
    vi.mocked(hasPermission).mockReturnValue(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (createDatabase() as any).database;
    db.where
      .mockResolvedValueOnce([{ id: "m1", siteAccessScope: "selected_sites" }]) // membership
      .mockResolvedValueOnce([]) // sites
      .mockResolvedValueOnce([{ id: "cat1", name: "Cat 1" }]); // categories

    const req = new NextRequest(
      "http://localhost/api/ledger/lookups?companyId=123e4567-e89b-12d3-a456-426614174000",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sites: [],
      costCategories: [{ id: "cat1", name: "Cat 1" }],
    });
  });
});
