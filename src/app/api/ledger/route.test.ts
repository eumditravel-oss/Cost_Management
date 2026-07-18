import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";
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

vi.mock("@/db/client", () => ({
  createDatabase: vi.fn(() => ({
    client: { end: vi.fn() },
    database: {
      select: () => ({
        from: () => ({
          where: mockWhere,
        }),
      }),
      transaction: mockTransaction,
    },
  })),
}));

describe("POST /api/ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      identity.getCurrentIdentity as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ userId: "user-1" });
    (auth.hasPermission as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  const createRequest = (body: unknown) =>
    new Request("http://localhost/api/ledger", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("fails if payload is not an array (0건 저장)", async () => {
    const res = await POST(createRequest({ companyId: "uuid" }));
    expect(res.status).toBe(400);
  });

  it("fails if companyIds are not uniform", async () => {
    const res = await POST(
      createRequest([
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
    const data = await res.json();
    expect(data.fields).toContain("companyId_must_be_uniform");
  });

  it("fails if manual tax is missing taxAmount (수기 세액 누락)", async () => {
    const res = await POST(
      createRequest([
        {
          companyId: "00000000-0000-4000-8000-000000000001",
          siteId: "00000000-0000-4000-8000-000000000002",
          costCategoryId: "00000000-0000-4000-8000-000000000003",
          occurredOn: "2023-01-01",
          itemName: "Test",
          supplyAmount: "10",
          isManualTax: true,
          // taxAmount is omitted
        },
      ]),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("CALCULATION_INPUT_INVALID");
    expect(data.fields).toContain("[0].taxAmount");
  });

  it("ignores taxAmount and recalculates from taxRate in auto mode", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000003" }]);

    const insertedValues: unknown[] = [];
    const mockTx = {
      insert: vi.fn(() => ({
        values: vi.fn((vals) => {
          insertedValues.push(vals);
          return { returning: vi.fn(() => [{ id: "new-record" }]) };
        }),
      })),
    };
    mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) =>
      cb(mockTx),
    );

    const res = await POST(
      createRequest([
        {
          companyId: "00000000-0000-4000-8000-000000000001",
          siteId: "00000000-0000-4000-8000-000000000002",
          costCategoryId: "00000000-0000-4000-8000-000000000003",
          occurredOn: "2023-01-01",
          itemName: "Test",
          supplyAmount: "100.00",
          taxRate: "10.0000",
          taxAmount: "5000.00", // Should be ignored
          isManualTax: false,
        },
      ]),
    );
    expect(res.status).toBe(201);

    // Verify that the transaction inserted the recalculated taxAmount (10.00)
    expect(insertedValues[0]).toMatchObject({
      supplyAmount: "100.00",
      taxAmount: "10.00", // 100 * 0.1 = 10
      totalAmount: "110.00",
    });
  });

  it("rejects mismatched company-site or company-category (INVALID_CATEGORY_FOR_COMPANY)", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sites exist
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // sites belong to company
      .mockResolvedValueOnce([]); // categories do not belong to company

    const res = await POST(
      createRequest([
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
      createRequest([
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

    // transaction 1회(위에서 mockTx로 1번 호출됨) 및 반환 records 2건
    expect(data.records).toHaveLength(2);

    // 각 행의 계산 금액 확인 (costEntries, costEntryAuditLogs 순서대로 insert 되므로 0, 2 인덱스 확인)
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
      createRequest([
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
          // supplyAmount, quantity, unitPrice all missing
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
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }])
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000003" }]);

    mockTransaction.mockRejectedValueOnce({ code: "23505" });

    const res = await POST(
      createRequest([
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
    const data = await res.json();
    expect(data.error).toBe("CONFLICT");
  });
});
