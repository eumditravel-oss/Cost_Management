"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateMoney } from "@/ledger/calculation";
import styles from "./page.module.css";

type Row = {
  occurredOn: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  supplyAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  description: string;
};
const fields: (keyof Row)[] = [
  "occurredOn",
  "itemName",
  "quantity",
  "unitPrice",
  "supplyAmount",
  "taxRate",
  "taxAmount",
  "description",
];
const displayFields: (keyof Row)[] = [...fields, "totalAmount"];
const labels: Record<keyof Row, string> = {
  occurredOn: "발생일",
  itemName: "품명",
  quantity: "수량",
  unitPrice: "단가",
  supplyAmount: "공급가액",
  taxRate: "세율(%)",
  taxAmount: "부가세",
  totalAmount: "합계",
  description: "적요",
};
const blank = (): Row => ({
  occurredOn: "",
  itemName: "",
  quantity: "",
  unitPrice: "",
  supplyAmount: "",
  taxRate: "",
  taxAmount: "",
  totalAmount: "0.00",
  description: "",
});
const storageKey = "cost-ledger-draft-v1";

function recalculate(row: Row): Row {
  const money = calculateMoney(row);
  return {
    ...row,
    supplyAmount: money.supplyAmount,
    taxAmount: money.taxAmount,
    totalAmount: money.totalAmount,
  };
}

export default function LedgerPage() {
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 12 }, blank));
  const [restored, setRestored] = useState(false);
  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0).toFixed(2),
    [rows],
  );
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Row[];
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setRows([
            ...parsed,
            ...Array.from({ length: Math.max(0, 12 - parsed.length) }, blank),
          ]);
          setRestored(true);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () => window.localStorage.setItem(storageKey, JSON.stringify(rows)),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [rows]);
  const update = (rowIndex: number, field: keyof Row, value: string) =>
    setRows((current) =>
      current.map((row, index) =>
        index === rowIndex
          ? recalculate({
              ...row,
              [field]: value,
              ...(field === "quantity" || field === "unitPrice"
                ? { supplyAmount: "" }
                : {}),
            })
          : row,
      ),
    );
  const paste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: keyof Row,
  ) => {
    const start = fields.indexOf(field);
    const matrix = event.clipboardData
      .getData("text")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t"));
    if (!matrix.length || matrix.every((line) => line.length < 2)) return;
    event.preventDefault();
    setRows((current) => {
      const next = [
        ...current,
        ...Array.from(
          { length: Math.max(0, rowIndex + matrix.length - current.length) },
          blank,
        ),
      ];
      matrix.forEach((line, offset) => {
        const updated = { ...next[rowIndex + offset] };
        line.forEach((value, column) => {
          const target = fields[start + column];
          if (target) updated[target] = value.trim();
        });
        next[rowIndex + offset] = recalculate(updated);
      });
      return next;
    });
  };
  const moveNext = (
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: keyof Row,
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const nextField = fields[(fields.indexOf(field) + 1) % fields.length];
    const nextRow = nextField === fields[0] ? rowIndex + 1 : rowIndex;
    document
      .querySelector<HTMLInputElement>(`[data-cell="${nextRow}-${nextField}"]`)
      ?.focus();
  };
  return (
    <main className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Phase 12 · 임시저장 입력 화면</p>
        <h1>통합 원가 원장</h1>
        <p>
          {restored
            ? "이전 임시입력을 복구했습니다."
            : "입력 내용은 이 브라우저에 자동 임시저장됩니다."}
        </p>
      </header>
      <section className={styles.toolbar}>
        <button
          type="button"
          onClick={() => setRows((current) => [...current, blank()])}
        >
          행 추가
        </button>
        <button
          type="button"
          onClick={() => {
            window.localStorage.removeItem(storageKey);
            setRows(Array.from({ length: 12 }, blank));
            setRestored(false);
          }}
        >
          임시입력 비우기
        </button>
        <strong>합계 {total}</strong>
      </section>
      <div className={styles.gridWrap}>
        <table>
          <thead>
            <tr>
              {displayFields.map((field) => (
                <th key={field}>{labels[field]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {fields.map((field) => (
                  <td key={field}>
                    <input
                      data-cell={`${rowIndex}-${field}`}
                      value={row[field]}
                      aria-label={`${rowIndex + 1}행 ${labels[field]}`}
                      onChange={(event) => update(rowIndex, field, event.target.value)}
                      onPaste={(event) => paste(event, rowIndex, field)}
                      onKeyDown={(event) => moveNext(event, rowIndex, field)}
                      inputMode={
                        field === "quantity" ||
                        field === "unitPrice" ||
                        field === "supplyAmount" ||
                        field === "taxRate" ||
                        field === "taxAmount"
                          ? "decimal"
                          : undefined
                      }
                    />
                  </td>
                ))}
                <td className={styles.readonly}>{row.totalAmount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.help}>
        Enter로 다음 셀 이동 · Excel 범위를 붙여넣으면 시작 셀부터 여러 행에 반영 ·
        공급가액은 수량과 단가 입력 시 자동 계산됩니다.
      </p>
    </main>
  );
}
