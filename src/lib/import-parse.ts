/** Разбор вставки из Excel: табуляция или пробелы между колонками. Длины — в миллиметрах. */

export type ImportedBlank = {
  lengthMm: number;
  quantity: number | "infinity";
  name: string;
  priority: number;
  material: string;
  cost: number | null;
};

export type ImportedSegment = {
  lengthMm: number;
  quantity: number;
  name: string;
  material: string;
};

function tokenizeLine(line: string): string[] {
  const t = line.trim();
  if (!t || t.startsWith("#") || t.startsWith("//")) return [];
  if (t.includes("\t")) {
    return t.split("\t").map((s) => s.trim());
  }
  return t.split(/\s+/).filter(Boolean);
}

function parseInfinityQty(raw: string): number | "infinity" | null {
  const t = raw.trim().toLowerCase();
  if (
    t === "" ||
    t === "∞" ||
    t === "inf" ||
    t === "infinity" ||
    t === "беск" ||
    t === "неогр"
  ) {
    return "infinity";
  }
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function parseNumberMaybe(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** мм → строка для полей формы (все длины в интерфейсе — в мм). */
export function formatMmForInput(mm: number): string {
  const n = Math.round(mm);
  if (Math.abs(mm - n) < 1e-6) return String(n);
  return String(Math.round(mm * 100) / 100).replace(/\.?0+$/, "");
}

/**
 * Заготовки: длина (мм), количество (0…∞ или ∞), название, очередность, материал, стоимость.
 */
export function parseBlanksPaste(text: string): {
  rows: ImportedBlank[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ImportedBlank[] = [];
  const lines = text.split(/\r?\n/);
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    const tok = tokenizeLine(line);
    if (tok.length === 0) continue;
    if (tok.length < 2) {
      errors.push(`Строка ${lineNo}: нужны минимум 2 колонки (длина и количество).`);
      continue;
    }
    const len = parseNumberMaybe(tok[0]);
    if (len == null || len <= 0) {
      errors.push(`Строка ${lineNo}: неверная длина заготовки «${tok[0]}».`);
      continue;
    }
    const lengthMm = Math.round(len);
    const qtyRaw = parseInfinityQty(tok[1]);
    if (qtyRaw === null) {
      errors.push(`Строка ${lineNo}: неверное количество «${tok[1]}».`);
      continue;
    }
    const name = (tok[2] ?? "").trim();
    const priority = parseNumberMaybe(tok[3] ?? "") ?? 0;
    const material = (tok[4] ?? "").trim();
    const costRaw = tok[5] != null ? parseNumberMaybe(tok[5]) : null;
    rows.push({
      lengthMm,
      quantity: qtyRaw,
      name,
      priority: Math.round(priority),
      material,
      cost: costRaw,
    });
  }
  return { rows, errors };
}

/**
 * Отрезки: длина (мм), количество, название, материал.
 */
export function parseSegmentsPaste(text: string): {
  rows: ImportedSegment[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: ImportedSegment[] = [];
  const lines = text.split(/\r?\n/);
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    const tok = tokenizeLine(line);
    if (tok.length === 0) continue;
    if (tok.length < 2) {
      errors.push(`Строка ${lineNo}: нужны минимум 2 колонки (длина и количество).`);
      continue;
    }
    const len = parseNumberMaybe(tok[0]);
    if (len == null || len <= 0) {
      errors.push(`Строка ${lineNo}: неверная длина отрезка «${tok[0]}».`);
      continue;
    }
    const lengthMm = Math.round(len);
    const q = parseInfinityQty(tok[1]);
    if (q === null || q === "infinity") {
      errors.push(
        `Строка ${lineNo}: для отрезков укажите конечное количество (не ∞).`
      );
      continue;
    }
    if (q === 0) continue;
    const name = (tok[2] ?? "").trim();
    const material = (tok[3] ?? "").trim();
    rows.push({ lengthMm, quantity: q, name, material });
  }
  return { rows, errors };
}

/**
 * Объединяет строки с одинаковой длиной: количества суммируются (как при многих строках «1429 1»).
 */
export function aggregateSegmentsByLength(
  rows: ImportedSegment[]
): ImportedSegment[] {
  const map = new Map<
    number,
    { qty: number; name: string; material: string }
  >();
  for (const r of rows) {
    const prev = map.get(r.lengthMm);
    if (!prev) {
      map.set(r.lengthMm, {
        qty: r.quantity,
        name: r.name,
        material: r.material,
      });
    } else {
      prev.qty += r.quantity;
      if (!prev.name && r.name) prev.name = r.name;
      if (!prev.material && r.material) prev.material = r.material;
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([lengthMm, v]) => ({
      lengthMm,
      quantity: v.qty,
      name: v.name,
      material: v.material,
    }));
}

export const EXAMPLE_BLANKS = `6000\t5\tТруба
12000\t0\tТруба2`;

export const EXAMPLE_SEGMENTS = `4358\t1
2794\t1
5617\t1`;
