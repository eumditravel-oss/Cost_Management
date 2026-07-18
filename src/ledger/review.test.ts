import { describe, it, expect } from "vitest";
import {
  validateRow,
  normalizeItemName,
  findDuplicateCandidates,
  LedgerRow,
  Candidate,
} from "./review";

describe("validateRow", () => {
  it("공급가액 누락 시 에러 반환", () => {
    const row: LedgerRow = { occurredOn: "2023-01-01", itemName: "A" };
    const errors = validateRow(row);
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "supplyAmount",
        message: "공급가액을 입력해주세요.",
      }),
    );
  });

  it("수량/단가 오류 시 두 필드 모두 에러 반환", () => {
    const row: LedgerRow = {
      occurredOn: "2023-01-01",
      itemName: "A",
      quantity: "abc", // invalid format
      unitPrice: "100",
    };
    const errors = validateRow(row);
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "quantity",
        message: "수량 형식이 올바르지 않습니다.",
      }),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "unitPrice",
        message: "단가 형식이 올바르지 않습니다.",
      }),
    );
  });

  it("수기 세액 누락 시 세액 에러 반환", () => {
    const row: LedgerRow = {
      occurredOn: "2023-01-01",
      itemName: "A",
      supplyAmount: "100",
      isManualTax: true,
      // taxAmount is missing
    };
    const errors = validateRow(row);
    expect(errors).toContainEqual(
      expect.objectContaining({
        field: "taxAmount",
        message: "수기 세액을 입력해주세요.",
      }),
    );
  });

  it("정상 행은 에러 없음", () => {
    const row: LedgerRow = {
      occurredOn: "2023-01-01",
      itemName: "A",
      supplyAmount: "100",
      taxRate: "10",
      taxAmount: "10",
    };
    expect(validateRow(row)).toEqual([]);
  });
});

describe("normalizeItemName", () => {
  it("좌우 공백 제거 및 대소문자 무시", () => {
    expect(normalizeItemName("  Test Item  ")).toBe("test item");
  });

  it("연속 공백 축소", () => {
    expect(normalizeItemName("A   B\tC")).toBe("a b c");
  });
});

describe("findDuplicateCandidates", () => {
  const context = {
    companyId: "c1",
    siteId: "s1",
    categoryId: "cat1",
  };

  const row: LedgerRow = {
    occurredOn: "2023-01-01",
    itemName: "Apple",
    totalAmount: "110",
  };

  it("동일 조건만 후보로 탐지", () => {
    const fetched: Candidate[] = [
      {
        id: "1",
        companyId: "c1",
        siteId: "s1",
        costCategoryId: "cat1",
        occurredOn: "2023-01-01",
        itemName: "  aPple ", // Normalized to "apple"
        totalAmount: "110",
      },
    ];
    const allRows: LedgerRow[] = [];
    const candidates = findDuplicateCandidates(row, 0, allRows, fetched, context);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("1");
  });

  it("금액 또는 비용분류가 다르면 후보 제외", () => {
    const fetched: Candidate[] = [
      {
        id: "1",
        companyId: "c1",
        siteId: "s1",
        costCategoryId: "cat2", // Diff
        occurredOn: "2023-01-01",
        itemName: "Apple",
        totalAmount: "110",
      },
      {
        id: "2",
        companyId: "c1",
        siteId: "s1",
        costCategoryId: "cat1",
        occurredOn: "2023-01-01",
        itemName: "Apple",
        totalAmount: "120", // Diff
      },
    ];
    const candidates = findDuplicateCandidates(row, 0, [], fetched, context);
    expect(candidates).toHaveLength(0);
  });

  it("자기 자신은 제외하고 화면 내 다른 행과 비교하여 후보 탐지", () => {
    const allRows: LedgerRow[] = [
      row, // 자기 자신
      {
        occurredOn: "2023-01-01",
        itemName: "Apple",
        totalAmount: "110",
      },
    ];
    const candidates = findDuplicateCandidates(row, 0, allRows, [], context);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].rowIndex).toBe(1);
  });

  it("총액이 0.00이거나 미입력 상태면 후보 제외", () => {
    const emptyRow: LedgerRow = {
      occurredOn: "2023-01-01",
      itemName: "Apple",
      totalAmount: "0.00",
    };
    const fetched: Candidate[] = [
      {
        id: "1",
        companyId: "c1",
        siteId: "s1",
        costCategoryId: "cat1",
        occurredOn: "2023-01-01",
        itemName: "Apple",
        totalAmount: "0.00",
      },
    ];
    const candidates = findDuplicateCandidates(emptyRow, 0, [], fetched, context);
    expect(candidates).toHaveLength(0);
  });
});
