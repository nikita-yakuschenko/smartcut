import * as XLSX from "xlsx";
import type { ImportedSegment } from "./import-parse";

function cellToNum(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function isLikelyHeaderRow(row: unknown[]): boolean {
  const a = row[0];
  const n = cellToNum(a);
  if (n != null && n > 0) return false;
  const s = String(a ?? "").toLowerCase();
  return /длин|length|размер|size|мм|\bmm\b|отрез|cut/i.test(s);
}

/**
 * Первый лист Excel: колонка A — длина (мм), B — количество (опционально название в C).
 */
export function parseSegmentsExcelBuffer(buf: ArrayBuffer): {
  rows: ImportedSegment[];
  errors: string[];
} {
  const errors: string[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: "array", cellDates: false });
  } catch {
    return { rows: [], errors: ["Не удалось прочитать файл Excel."] };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["В книге нет листов."] };
  }
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  if (data.length === 0) {
    return { rows: [], errors: ["Первый лист пуст."] };
  }

  let start = 0;
  if (isLikelyHeaderRow(data[0] ?? [])) start = 1;

  const rows: ImportedSegment[] = [];
  for (let i = start; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    const len = cellToNum(row[0]);
    if (len == null || len <= 0) continue;
    const lengthMm = Math.round(len);
    const qRaw = cellToNum(row[1]);
    // Только колонка A — одна деталь этой длины (как список строк из Excel).
    const quantity =
      qRaw == null ? 1 : Math.max(0, Math.floor(qRaw));
    if (quantity === 0) continue;
    const name = String(row[2] ?? "").trim();
    const material = String(row[3] ?? "").trim();
    rows.push({ lengthMm, quantity, name, material });
  }

  if (rows.length === 0) {
    errors.push(
      "Не найдено ни одной строки с длиной > 0 и количеством > 0 (колонки A и B)."
    );
  }

  return { rows, errors };
}
