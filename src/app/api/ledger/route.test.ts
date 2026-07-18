import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import * as identity from "@/auth/identity";
import * as auth from "@/auth/authorization";

vi.mock("@/auth/identity", () => ({
  getCurrentIdentity: vi.fn(),
}));
vi.mock("@/auth/authorization", () => ({
  hasPermission: vi.fn(),
}));

const mockTransaction = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));

vi.mock("@/db/client", () => ({
  createDatabase: vi.fn(() => ({
    client: { end: vi.fn() },
    database: {
      select: () => {
        const fromChain = {
          leftJoin: () => fromChain,
          where: mockWhere,
        };
        return {
          from: () => fromChain,
        };
      },
      transaction: mockTransaction,
    },
  })),
}));

describe("Ledger API Scope and Permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      identity.getCurrentIdentity as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ userId: "user-1" });
    (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_user, perm) => {
        return perm === "ledger.write"; // Default for old POST tests
      },
    );
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);
  });

  const createPostRequest = (body: unknown) =>
    new Request("http://localhost/api/ledger", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const createGetRequest = (companyId: string | null) =>
    new Request(
      `http://localhost/api/ledger${companyId ? `?companyId=${companyId}` : ""}`,
      {
        method: "GET",
      },
    );

  describe("Authentication and Permissions", () => {
    it("returns 401 if unauthenticated", async () => {
      (
        identity.getCurrentIdentity as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      const resGet = await GET(
        createGetRequest("00000000-0000-4000-8000-000000000001"),
      );
      const resPost = await POST(createPostRequest([]));
      expect(resGet.status).toBe(401);
      expect(resPost.status).toBe(401);
    });

    it("master_data.write only -> GET/POST denied (403)", async () => {
      (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_user, perm) => perm === "master_data.write",
      );
      const resGet = await GET(
        createGetRequest("00000000-0000-4000-8000-000000000001"),
      );
      const resPost = await POST(createPostRequest([]));
      expect(resGet.status).toBe(403);
      expect(resPost.status).toBe(403);
    });

    it("ledger.read only -> GET allowed, POST denied", async () => {
      (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_user, perm) => perm === "ledger.read",
      );
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]); // company scope
      mockLimit.mockResolvedValueOnce([
        { entry: { id: "record-1" }, siteName: "Site 1", costCategoryName: "Cat 1" },
      ]); // get records
      const resGet = await GET(
        createGetRequest("00000000-0000-4000-8000-000000000001"),
      );
      const resPost = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "10",
          },
        ]),
      );
      expect(resGet.status).toBe(200);
      expect(resPost.status).toBe(403);
    });

    it("ledger.write only -> POST allowed, GET denied", async () => {
      (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_user, perm) => perm === "ledger.write",
      );
      const resGet = await GET(
        createGetRequest("00000000-0000-4000-8000-000000000001"),
      );
      expect(resGet.status).toBe(403);

      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]) // companyScope
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // validSites
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sitesCompanyCheck
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000003" }]); // categoriesCompanyCheck

      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ returning: vi.fn(() => [{}]) })),
        })),
      };
      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) =>
        cb(mockTx),
      );

      const resPost = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "10",
          },
        ]),
      );
      expect(resPost.status).toBe(201);
    });
  });

  describe("Scope: all_sites vs selected_sites", () => {
    beforeEach(() => {
      (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it("GET: inactive company membership -> 403 SCOPE_FORBIDDEN", async () => {
      mockWhere.mockResolvedValueOnce([]); // no active company membership
      const res = await GET(createGetRequest("00000000-0000-4000-8000-000000000001"));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("SCOPE_FORBIDDEN");
    });

    it("GET: all_sites returns all company records", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]); // companyScope
      mockLimit.mockResolvedValueOnce([
        { entry: { id: "record-1" }, siteName: "Site 1", costCategoryName: "Cat 1" },
      ]); // query
      const res = await GET(createGetRequest("00000000-0000-4000-8000-000000000001"));
      expect(res.status).toBe(200);
      expect((await res.json()).records).toHaveLength(1);
    });

    it("GET: selected_sites returns only allowed sites", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "selected_sites" }]) // companyScope
        .mockResolvedValueOnce([{ siteId: "site-1" }, { siteId: "site-2" }]); // siteScopes
      mockLimit.mockResolvedValueOnce([
        { entry: { id: "record-1" }, siteName: "Site 1", costCategoryName: "Cat 1" },
      ]); // query
      const res = await GET(createGetRequest("00000000-0000-4000-8000-000000000001"));
      expect(res.status).toBe(200);
      expect((await res.json()).records).toHaveLength(1);
    });

    it("GET: selected_sites with no active site memberships returns empty array", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "selected_sites" }]) // companyScope
        .mockResolvedValueOnce([]); // siteScopes (empty)
      const res = await GET(createGetRequest("00000000-0000-4000-8000-000000000001"));
      expect(res.status).toBe(200);
      expect((await res.json()).records).toEqual([]);
    });

    it("POST: inactive company membership -> 403", async () => {
      mockWhere.mockResolvedValueOnce([]); // no active company membership
      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "10",
          },
        ]),
      );
      expect(res.status).toBe(403);
    });

    it("POST: selected_sites rejects batch if any site is not allowed", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "selected_sites" }]) // companyScope
        .mockResolvedValueOnce([{ siteId: "allowed-site-id" }]); // siteScopes
      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000009", // Valid UUID
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "10",
          },
        ]),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET Filters and Pagination", () => {
    beforeEach(() => {
      (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it("returns 400 for invalid dates or UUIDs", async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&from=invalid",
        ),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid cursor format", async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&cursor=bad_cursor",
        ),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-calendar dates", async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&from=2023-02-29",
        ),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for fractional limit", async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&limit=1.5",
        ),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 if from > to", async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&from=2023-12-31&to=2023-01-01",
        ),
      );
      expect(res.status).toBe(400);
    });

    it("all_sites scope is maintained when filtering by siteId", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]);
      mockLimit.mockResolvedValueOnce([]); // no records
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&siteId=00000000-0000-4000-8000-000000000002",
        ),
      );
      expect(res.status).toBe(200);
    });

    it("selected_sites rejects unallowed siteId filter (403)", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "selected_sites" }]) // companyScope
        .mockResolvedValueOnce([{ siteId: "00000000-0000-4000-8000-000000000003" }]); // siteScopes
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&siteId=00000000-0000-4000-8000-000000000002",
        ),
      );
      expect(res.status).toBe(403);
    });

    it("selected_sites with 0 active sites and siteId requested -> 403", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "selected_sites" }]) // companyScope
        .mockResolvedValueOnce([]); // siteScopes (0 active sites)
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&siteId=00000000-0000-4000-8000-000000000002",
        ),
      );
      expect(res.status).toBe(403);
    });

    it("returns records and nextCursor if limit is exceeded", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]);
      mockLimit.mockResolvedValueOnce([
        {
          entry: {
            id: "00000000-0000-4000-8000-00000000000a",
            occurredOn: "2023-01-03",
          },
          siteName: "Site A",
          costCategoryName: "Cat A",
        },
        {
          entry: {
            id: "00000000-0000-4000-8000-00000000000b",
            occurredOn: "2023-01-02",
          },
          siteName: "Site B",
          costCategoryName: "Cat B",
        },
        {
          entry: {
            id: "00000000-0000-4000-8000-00000000000c",
            occurredOn: "2023-01-01",
          },
          siteName: "Site C",
          costCategoryName: "Cat C",
        },
      ]);
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&limit=2",
        ),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.records).toHaveLength(2);
      expect(data.nextCursor).toBe("2023-01-02_00000000-0000-4000-8000-00000000000b");
    });

    it("returns nextCursor = null if limit is not exceeded", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]);
      mockLimit.mockResolvedValueOnce([
        {
          entry: {
            id: "00000000-0000-4000-8000-00000000000a",
            occurredOn: "2023-01-03",
          },
          siteName: "Site A",
          costCategoryName: "Cat A",
        },
      ]);
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&limit=2",
        ),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.records).toHaveLength(1);
      expect(data.nextCursor).toBeNull();
    });

    it("applies range, item, category filters", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]);
      mockLimit.mockResolvedValueOnce([]);
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&from=2023-01-01&to=2023-12-31&itemQuery=test&costCategoryId=00000000-0000-4000-8000-000000000002",
        ),
      );
      expect(res.status).toBe(200);
    });

    it("applies cursor filter", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]);
      mockLimit.mockResolvedValueOnce([]);
      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001&cursor=2023-01-01_00000000-0000-4000-8000-000000000001",
        ),
      );
      expect(res.status).toBe(200);
    });

    it("returns correct response structure with siteName and costCategoryName", async () => {
      mockWhere.mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]);
      mockLimit.mockResolvedValueOnce([
        {
          entry: { id: "record-1", occurredOn: "2023-01-01", itemName: "Coffee" },
          siteName: "HQ",
          costCategoryName: "Meals",
        },
        {
          entry: { id: "record-2", occurredOn: "2023-01-02", itemName: "Taxi" },
          siteName: null,
          costCategoryName: null,
        },
      ]);

      const res = await GET(
        new Request(
          "http://localhost/api/ledger?companyId=00000000-0000-4000-8000-000000000001",
        ),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.records).toHaveLength(2);
      expect(data.records[0]).toEqual({
        id: "record-1",
        occurredOn: "2023-01-01",
        itemName: "Coffee",
        siteName: "HQ",
        costCategoryName: "Meals",
      });
      expect(data.records[1]).toEqual({
        id: "record-2",
        occurredOn: "2023-01-02",
        itemName: "Taxi",
        siteName: null,
        costCategoryName: null,
      });
    });
  });

  describe("Regression: Existing POST Validations", () => {
    beforeEach(() => {
      (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it("fails if payload is not an array", async () => {
      const res = await POST(
        createPostRequest({ companyId: "00000000-0000-4000-8000-000000000001" }),
      );
      expect(res.status).toBe(400);
    });

    it("fails if companyIds are not uniform", async () => {
      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "A",
            supplyAmount: "10",
          },
          {
            companyId: "00000000-0000-4000-8000-000000000004",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "B",
            supplyAmount: "10",
          },
        ]),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).fields).toContain("companyId_must_be_uniform");
    });

    it("fails if manual tax is missing taxAmount", async () => {
      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "10",
            isManualTax: true,
          },
        ]),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("CALCULATION_INPUT_INVALID");
    });

    it("ignores taxAmount and recalculates from taxRate in auto mode", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]) // companyScope
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000003" }]);

      const insertedValues: unknown[] = [];
      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn((vals) => {
            insertedValues.push(vals);
            return { returning: vi.fn(() => [{ id: "new" }]) };
          }),
        })),
      };
      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) =>
        cb(mockTx),
      );

      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "100.00",
            taxRate: "10.0000",
            taxAmount: "5000.00",
            isManualTax: false,
          },
        ]),
      );
      expect(res.status).toBe(201);
      expect(insertedValues[0]).toMatchObject({
        supplyAmount: "100.00",
        taxAmount: "10.00",
        totalAmount: "110.00",
      });
    });

    it("rejects mismatched company-site or company-category (INVALID_CATEGORY_FOR_COMPANY)", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]) // companyScope
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sites exist
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sites belong to company
        .mockResolvedValueOnce([]); // categories do not belong to company

      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "10",
          },
        ]),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CATEGORY_FOR_COMPANY");
    });

    it("복수 유효 행 2건 저장 성공 테스트", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]) // companyScope
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sites
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sites company check
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000003" }]); // categories company check

      const insertedValues: unknown[] = [];
      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn((vals) => {
            insertedValues.push(vals);
            return {
              returning: vi.fn(() => [{ id: "new-record-" + insertedValues.length }]),
            };
          }),
        })),
      };
      mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) =>
        cb(mockTx),
      );

      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Row 1",
            supplyAmount: "100.00",
            taxRate: "10.0000",
          },
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Row 2",
            supplyAmount: "200.00",
            taxRate: "5.0000",
          },
        ]),
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.records).toHaveLength(2);
      expect(insertedValues[0]).toMatchObject({
        supplyAmount: "100.00",
        taxAmount: "10.00",
      });
      expect(insertedValues[2]).toMatchObject({
        supplyAmount: "200.00",
        taxAmount: "10.00",
      });
    });

    it("복수 행 성공 및 한 행 검증 실패 시 0건 저장 규칙 확인", async () => {
      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Valid row",
            supplyAmount: "10",
          },
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Invalid row",
          },
        ]),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("CALCULATION_INPUT_INVALID");
      expect(data.fields).toContain("[1].supplyAmount");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("responds safely to unique constraint errors", async () => {
      mockWhere
        .mockResolvedValueOnce([{ id: "m-1", scope: "all_sites" }]) // companyScope
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
        .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000003" }]);

      mockTransaction.mockRejectedValueOnce({ code: "23505" });
      const res = await POST(
        createPostRequest([
          {
            companyId: "00000000-0000-4000-8000-000000000001",
            siteId: "00000000-0000-4000-8000-000000000002",
            costCategoryId: "00000000-0000-4000-8000-000000000003",
            occurredOn: "2023-01-01",
            itemName: "Test",
            supplyAmount: "100.00",
          },
        ]),
      );
      expect(res.status).toBe(409);
    });
  });
});
