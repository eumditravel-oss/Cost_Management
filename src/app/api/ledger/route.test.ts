import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";
import * as identity from "@/auth/identity";

vi.mock("@/auth/identity", () => ({
  getCurrentIdentity: vi.fn(),
}));
vi.mock("@/auth/authorization", () => ({
  hasPermission: vi.fn(() => true),
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
    vi.resetAllMocks();
    (identity.getCurrentIdentity as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "user-1" });
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

  it("rejects mismatched company-site or company-category", async () => {
    mockWhere.mockResolvedValueOnce([]); // No valid sites found

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
    expect(data.error).toBe("INVALID_SITE_FOR_COMPANY");
  });

  it("recalculates tax correctly and responds safely to unique constraint errors", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000002" }]) // initial site check
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
          taxRate: "10.0000",
          isManualTax: false,
        },
      ]),
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("CONFLICT");
  });
});
