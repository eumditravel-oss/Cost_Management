"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateMoney } from "@/ledger/calculation";
import { validateRow, findDuplicateCandidates, Candidate } from "@/ledger/review";
import styles from "./page.module.css";

type Row = {
  occurredOn: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  supplyAmount: string;
  taxRate: string;
  isManualTax: boolean;
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
  "isManualTax",
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
  isManualTax: "수기 세액",
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
  isManualTax: false,
  taxAmount: "",
  totalAmount: "0.00",
  description: "",
});
const storageKey = "cost-ledger-draft-v1";
const masterDataStorageKey = "cost-ledger-master-data-v1";

function recalculate(row: Row): Row {
  const money = calculateMoney({
    quantity: row.quantity || undefined,
    unitPrice: row.unitPrice || undefined,
    supplyAmount: row.supplyAmount || undefined,
    taxRate: row.taxRate || undefined,
    taxAmount: row.taxAmount || undefined,
    isManualTax: row.isManualTax,
  });
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

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [companyId, setCompanyId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [candidatesSource, setCandidatesSource] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);

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
    const savedMaster = window.localStorage.getItem(masterDataStorageKey);
    if (savedMaster) {
      try {
        const parsed = JSON.parse(savedMaster);
        if (parsed.companyId) setCompanyId(parsed.companyId);
        if (parsed.siteId) setSiteId(parsed.siteId);
        if (parsed.categoryId) setCategoryId(parsed.categoryId);
      } catch {
        window.localStorage.removeItem(masterDataStorageKey);
      }
    }

    fetch("/api/master-data/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.records || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(rows));
      window.localStorage.setItem(
        masterDataStorageKey,
        JSON.stringify({ companyId, siteId, categoryId }),
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [rows, companyId, siteId, categoryId]);

  useEffect(() => {
    if (!companyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSites([]);
      setCategories([]);
      setCandidatesSource([]);
      return;
    }
    fetch(`/api/master-data/sites?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => setSites(d.records || []))
      .catch(() => {});
    fetch(`/api/master-data/cost-categories?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.records || []))
      .catch(() => {});
    fetch(`/api/ledger?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => setCandidatesSource(d.records || []))
      .catch(() => {});
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId || !siteId || !categoryId) {
      alert("회사, 현장, 비용 분류를 선택해주세요.");
      return;
    }
    const validRows = rows.filter((r) => r.occurredOn && r.itemName);
    if (validRows.length === 0) {
      alert("저장할 데이터가 없습니다.");
      return;
    }
    setSaving(true);
    try {
      const payload = validRows.map((row, index) => {
        const money = calculateMoney({
          quantity: row.quantity || undefined,
          unitPrice: row.unitPrice || undefined,
          supplyAmount: row.supplyAmount || undefined,
          taxRate: row.taxRate || undefined,
          taxAmount: row.taxAmount || undefined,
          isManualTax: row.isManualTax,
        });
        if (money.fieldErrors.length > 0) {
          throw new Error(`행 ${index + 1} 계산 오류: ${money.fieldErrors.join(", ")}`);
        }
        return {
          companyId,
          siteId,
          costCategoryId: categoryId,
          occurredOn: row.occurredOn,
          itemName: row.itemName,
          quantity: row.quantity || undefined,
          unitPrice: row.unitPrice || undefined,
          supplyAmount: money.supplyAmount,
          taxRate: row.taxRate || undefined,
          taxAmount: money.taxAmount,
          isManualTax: row.isManualTax,
          description: row.description || undefined,
        };
      });

      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`저장 실패: ${data.error || "알 수 없는 오류"}`);
      }
      if (data.records) {
        setCandidatesSource((prev) => [...data.records, ...prev]);
      }
      alert(`${validRows.length}건이 저장되었습니다.`);
      window.localStorage.removeItem(storageKey);
      setRows(Array.from({ length: 12 }, blank));
      setRestored(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const update = (rowIndex: number, field: keyof Row, value: string | boolean) =>
    setRows((current) =>
      current.map((row, index) =>
        index === rowIndex
          ? recalculate({
              ...row,
              [field]: value,
              ...(field === "quantity" || field === "unitPrice"
                ? { supplyAmount: "" }
                : {}),
              ...(field === "taxRate" && !row.isManualTax ? { taxAmount: "" } : {}),
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
          if (target && target !== "isManualTax") {
            updated[target] = value.trim() as never;
          }
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
        <select
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setSiteId("");
            setCategoryId("");
          }}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
        >
          <option value="">회사 선택</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
        >
          <option value="">현장 선택</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
        >
          <option value="">비용 분류 선택</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
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
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            fontWeight: 600,
          }}
        >
          {saving ? "저장 중..." : "저장"}
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
              <th key="status">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const rowErrors = validateRow(row);
              const errorFields = rowErrors.map((e) => e.field);
              const duplicates = findDuplicateCandidates(
                row,
                rowIndex,
                rows,
                candidatesSource,
                { companyId, siteId, categoryId },
              );

              return (
                <tr key={rowIndex}>
                  {fields.map((field) => (
                    <td key={field}>
                      {field === "isManualTax" ? (
                        <input
                          type="checkbox"
                          checked={row[field]}
                          onChange={(e) => update(rowIndex, field, e.target.checked)}
                        />
                      ) : (
                        <input
                          data-cell={`${rowIndex}-${field}`}
                          value={row[field] as string}
                          aria-label={`${rowIndex + 1}행 ${labels[field]}`}
                          aria-invalid={
                            errorFields.includes(field) ? "true" : undefined
                          }
                          onChange={(event) =>
                            update(rowIndex, field, event.target.value)
                          }
                          onPaste={(event) => paste(event, rowIndex, field)}
                          onKeyDown={(event) => moveNext(event, rowIndex, field)}
                          readOnly={field === "taxAmount" && !row.isManualTax}
                          style={{
                            backgroundColor:
                              field === "taxAmount" && !row.isManualTax
                                ? "#f1f5f9"
                                : "transparent",
                          }}
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
                      )}
                    </td>
                  ))}
                  <td className={styles.readonly}>{row.totalAmount}</td>
                  <td className={styles.statusCell}>
                    {rowErrors.length > 0 && (
                      <div className={styles.errorSummary}>
                        {rowErrors.map((e, i) => (
                          <div key={i}>❌ {e.message}</div>
                        ))}
                      </div>
                    )}
                    {duplicates.length > 0 && (
                      <div className={styles.warningSummary}>
                        ⚠️ 중복 의심 ({duplicates.length}건)
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.help}>
        Enter로 다음 셀 이동 · Excel 범위를 붙여넣으면 시작 셀부터 여러 행에 반영 ·
        공급가액은 수량과 단가 입력 시 자동 계산됩니다.
        <br />
        중복 확인은 최근 저장된 200건 내에서만 이루어지며 기술적 주의 알림입니다.
      </p>
    </main>
  );
}
