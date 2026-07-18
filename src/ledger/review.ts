import { calculateMoney } from "./calculation";

export type LedgerRow = {
  occurredOn: string;
  itemName: string;
  quantity?: string;
  unitPrice?: string;
  supplyAmount?: string;
  taxRate?: string;
  isManualTax?: boolean;
  taxAmount?: string;
  totalAmount?: string;
  description?: string;
};

export type RowError = {
  field: keyof LedgerRow;
  message: string;
};

/**
 * 행의 데이터에 대한 에러 메세지를 매핑합니다.
 */
export function validateRow(row: LedgerRow): RowError[] {
  // 아무 내용도 입력되지 않은 초기 행은 검증에서 제외하거나, 필수 필드 위주로만 판단.
  if (!row.occurredOn && !row.itemName && !row.supplyAmount) {
    return [];
  }

  const errors: RowError[] = [];
  const money = calculateMoney({
    quantity: row.quantity || undefined,
    unitPrice: row.unitPrice || undefined,
    supplyAmount: row.supplyAmount || undefined,
    taxRate: row.taxRate || undefined,
    taxAmount: row.taxAmount || undefined,
    isManualTax: row.isManualTax,
  });

  if (money.fieldErrors.includes("supplyAmount")) {
    errors.push({ field: "supplyAmount", message: "공급가액을 입력해주세요." });
  }
  if (money.fieldErrors.includes("quantityOrUnitPrice")) {
    errors.push({ field: "quantity", message: "수량 형식이 올바르지 않습니다." });
    errors.push({ field: "unitPrice", message: "단가 형식이 올바르지 않습니다." });
  }
  if (money.fieldErrors.includes("taxAmount")) {
    errors.push({ field: "taxAmount", message: "수기 세액을 입력해주세요." });
  }
  if (money.fieldErrors.includes("taxAmountOrTaxRate")) {
    if (row.isManualTax) {
      errors.push({ field: "taxAmount", message: "세액 형식이 올바르지 않습니다." });
    } else {
      errors.push({ field: "taxRate", message: "세율 형식이 올바르지 않습니다." });
    }
  }

  return errors;
}

/**
 * 중복 판정을 위한 품명 정규화
 * 좌우 공백 제거, 연속 공백 축소, 소문자 변환
 */
export function normalizeItemName(name: string): string {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type Candidate = {
  id?: string; // DB 레코드인 경우
  rowIndex?: number; // 화면 내 다른 행인 경우
  occurredOn: string;
  itemName: string;
  totalAmount: string;
  companyId: string;
  siteId: string;
  costCategoryId: string;
};

export type CurrentContext = {
  companyId: string;
  siteId: string;
  categoryId: string;
};

/**
 * 특정 행에 대해 중복 후보가 있는지 검사합니다.
 */
export function findDuplicateCandidates(
  row: LedgerRow,
  rowIndex: number,
  allRows: LedgerRow[],
  fetchedRecords: Candidate[],
  context: CurrentContext,
): Candidate[] {
  if (!row.itemName || !row.occurredOn || !row.totalAmount) {
    return [];
  }

  const { companyId, siteId, categoryId } = context;
  if (!companyId || !siteId || !categoryId) {
    return [];
  }

  const normalizedName = normalizeItemName(row.itemName);
  const candidates: Candidate[] = [];

  // DB 저장된 레코드 중 비교
  for (const record of fetchedRecords) {
    if (
      record.companyId === companyId &&
      record.siteId === siteId &&
      record.costCategoryId === categoryId &&
      record.occurredOn === row.occurredOn &&
      normalizeItemName(record.itemName) === normalizedName &&
      record.totalAmount === row.totalAmount
    ) {
      candidates.push(record);
    }
  }

  // 현재 입력 중인 다른 행과 비교
  for (let i = 0; i < allRows.length; i++) {
    if (i === rowIndex) continue; // 자기 자신 제외
    const other = allRows[i];
    if (
      other.occurredOn === row.occurredOn &&
      other.totalAmount === row.totalAmount &&
      normalizeItemName(other.itemName) === normalizedName
    ) {
      candidates.push({
        rowIndex: i,
        companyId,
        siteId,
        costCategoryId: categoryId,
        occurredOn: other.occurredOn,
        itemName: other.itemName,
        totalAmount: other.totalAmount || "0.00",
      });
    }
  }

  return candidates;
}
