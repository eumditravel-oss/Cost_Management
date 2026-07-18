"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateMoney } from "@/ledger/calculation";
import {
  validateRow,
  findDuplicateCandidates,
  Candidate,
  LedgerRow,
} from "@/ledger/review";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  DraftState,
  Template,
  getTemplates,
  saveTemplate,
  deleteTemplate,
  getRecentItems,
  addRecentItems,
} from "@/ledger/storage";
import styles from "./page.module.css";

type Row = LedgerRow;
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

  const [draftAvailable, setDraftAvailable] = useState<DraftState | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [recentItems, setRecentItems] = useState<string[]>([]);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftAvailable(draft);
    }

    setTemplates(getTemplates());
    setRecentItems(getRecentItems());

    const savedMaster = window.localStorage.getItem(masterDataStorageKey);
    if (savedMaster && !draft) {
      // Only set master data from previous if we aren't showing a draft prompt, otherwise wait for draft restore
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

  // Autosave
  useEffect(() => {
    if (draftAvailable) return; // Do not autosave while prompting for draft recovery
    const timer = window.setTimeout(() => {
      const ts = Date.now();
      saveDraft({ rows, companyId, siteId, categoryId, timestamp: ts });
      setLastSavedAt(ts);
      window.localStorage.setItem(
        masterDataStorageKey,
        JSON.stringify({ companyId, siteId, categoryId }),
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [rows, companyId, siteId, categoryId, draftAvailable]);

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

  const handleRestoreDraft = () => {
    if (!draftAvailable) return;
    setRows([
      ...draftAvailable.rows,
      ...Array.from({ length: Math.max(0, 12 - draftAvailable.rows.length) }, blank),
    ]);
    setCompanyId(draftAvailable.companyId);
    setSiteId(draftAvailable.siteId);
    setCategoryId(draftAvailable.categoryId);
    setDraftAvailable(null);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftAvailable(null);
  };

  const handleSaveTemplate = () => {
    const name = window.prompt("템플릿 이름을 입력하세요:");
    if (!name) return;
    const meaningfulRows = rows.filter(
      (r) => r.occurredOn || r.itemName || r.supplyAmount,
    );
    const newTemplate: Template = {
      id: Date.now().toString(),
      name,
      companyId,
      siteId,
      categoryId,
      rows: meaningfulRows,
    };
    saveTemplate(newTemplate);
    setTemplates(getTemplates());
    setSelectedTemplateId(newTemplate.id);
  };

  const handleLoadTemplate = () => {
    if (!selectedTemplateId) return;
    const t = templates.find((x) => x.id === selectedTemplateId);
    if (!t) return;

    const hasData = rows.some((r) => r.occurredOn || r.itemName || r.supplyAmount);
    if (hasData) {
      if (
        !window.confirm(
          "현재 입력된 내용이 삭제되고 템플릿으로 덮어쓰여집니다. 계속하시겠습니까?",
        )
      )
        return;
    }
    setRows([
      ...t.rows,
      ...Array.from({ length: Math.max(0, 12 - t.rows.length) }, blank),
    ]);
    setCompanyId(t.companyId);
    setSiteId(t.siteId);
    setCategoryId(t.categoryId);
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return;
    if (window.confirm("템플릿을 삭제하시겠습니까? (현재 브라우저에서만 삭제됩니다)")) {
      deleteTemplate(selectedTemplateId);
      setTemplates(getTemplates());
      setSelectedTemplateId("");
    }
  };

  const handleRenameTemplate = () => {
    if (!selectedTemplateId) return;
    const t = templates.find((x) => x.id === selectedTemplateId);
    if (!t) return;
    const newName = window.prompt("변경할 템플릿 이름을 입력하세요:", t.name);
    if (newName && newName.trim()) {
      import("@/ledger/storage").then(({ renameTemplate }) => {
        renameTemplate(selectedTemplateId, newName.trim());
        setTemplates(getTemplates());
      });
    }
  };

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

      const newRecentItems = addRecentItems(validRows.map((r) => r.itemName));
      setRecentItems(newRecentItems);

      alert(`${validRows.length}건이 저장되었습니다.`);
      clearDraft();
      setRows(Array.from({ length: 12 }, blank));
      setLastSavedAt(null);
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

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <main className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Phase 12 · 임시저장 입력 화면</p>
        <h1>통합 원가 원장</h1>
        <p>입력 내용은 이 브라우저에 자동 임시저장됩니다.</p>
      </header>

      {draftAvailable && (
        <div className={styles.draftBanner}>
          이전에 자동 임시저장된 내용이 있습니다. (
          {formatTime(draftAvailable.timestamp)})
          <button className={styles.primary} onClick={handleRestoreDraft}>
            복구
          </button>
          <button onClick={handleDiscardDraft}>폐기</button>
        </div>
      )}

      <section className={styles.templateBar}>
        <select
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
        >
          <option value="">템플릿 선택...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleLoadTemplate}
          disabled={!selectedTemplateId}
        >
          불러오기
        </button>
        <button
          type="button"
          onClick={handleRenameTemplate}
          disabled={!selectedTemplateId}
        >
          이름 변경
        </button>
        <button
          type="button"
          onClick={handleDeleteTemplate}
          disabled={!selectedTemplateId}
        >
          삭제
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={handleSaveTemplate}>
          현재 내용을 템플릿으로 저장
        </button>
      </section>

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

        {lastSavedAt && (
          <span className={styles.lastSaved}>
            마지막 저장: {formatTime(lastSavedAt)}
          </span>
        )}

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
            clearDraft();
            setRows(Array.from({ length: 12 }, blank));
            setLastSavedAt(null);
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

      <datalist id="recent-item-names">
        {recentItems.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

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
                          list={field === "itemName" ? "recent-item-names" : undefined}
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
        <br />※ 자동 임시저장, 입력 템플릿, 최근 품명 기능은 현재 사용 중인 브라우저
        내에서만 보관(최대 100건 등 기술적 제한 있음)되며 서버로 전송되지 않습니다.
        <br />
        임시저장과 템플릿 기능은 <strong>적요를 포함한 전체 입력 행 데이터</strong>를
        브라우저 localStorage에 보관하므로, 공용 PC 사용 시 로그아웃 및 브라우저 캐시
        삭제에 유의해주세요.
      </p>
    </main>
  );
}
