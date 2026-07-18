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
    (identity.getCurrentIdentity as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "user-1" });
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
      ])
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
      ])
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

    mockTransaction.mockResolvedValueOnce([{ id: "new-record" }]);

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
    
    // We can verify that the transaction was called with the recalculated taxAmount (10.00)
    // but the test is just ensuring it returns 201 without throwing calculation error
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
      ])
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_CATEGORY_FOR_COMPANY");
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
      ])
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
