"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CuttingBarDiagram } from "@/components/cutting-bar-diagram";
import { HintTip } from "@/components/hint-tip";
import { Textarea } from "@/components/ui/textarea";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/nav-user";
import {
  aggregateSegmentsByLength,
  EXAMPLE_BLANKS,
  EXAMPLE_SEGMENTS,
  formatMmForInput,
  parseBlanksPaste,
  parseSegmentsPaste,
  type ImportedSegment,
} from "@/lib/import-parse";
import { downloadCuttingPdf } from "@/lib/cutting-pdf";
import {
  MAX_EXACT_PIECES,
  solveCuttingFromStocks,
  STOCK_UNLIMITED,
  validateDemands,
  groupConsecutiveIdenticalBars,
  type BarLayout,
  type CuttingResult,
  type DemandItem,
  type PlacedPiece,
  type StockSpec,
} from "@/lib/cutting";
import { formatStockLengthsBadgeRu } from "@/lib/stock-length-label-ru";
import {
  CheckCircle2,
  CircleAlert,
  FileDown,
  Info,
  Layers,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  GalleryVerticalEndIcon,
} from "lucide-react";

function newId() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type PieceRow = {
  id: string;
  label: string;
  /** наружная длина, мм */
  outerMm: string;
  /** внутренняя длина, мм — опционально */
  innerMm: string;
  qty: string;
};

type StockRow = {
  id: string;
  /** длина заготовки, мм */
  lengthMm: string;
  /** пусто или ∞ — без лимита */
  qty: string;
};

function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Округление ввода длины до целых мм (как в импорте). */
function parseLengthMm(s: string): number | null {
  const n = parseNum(s);
  if (n == null) return null;
  return Math.round(n);
}

/** Сколько целых заготовок каждой длины в решении (длины по убыванию). */
function aggregateStockLengths(
  bars: readonly { stockLengthMm: number }[]
): { lengthMm: number; count: number }[] {
  const map = new Map<number, number>();
  for (const bar of bars) {
    const L = Math.round(bar.stockLengthMm);
    map.set(L, (map.get(L) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([lengthMm, count]) => ({ lengthMm, count }));
}

function buildDefaultPieceRows(): PieceRow[] {
  return [
    {
      id: newId(),
      label: "Тип A",
      outerMm: "770",
      innerMm: "",
      qty: "1",
    },
    {
      id: newId(),
      label: "Тип B",
      outerMm: "570",
      innerMm: "",
      qty: "1",
    },
  ];
}

const defaultRows: PieceRow[] = buildDefaultPieceRows();

const APP_STATE_STORAGE_KEY = "smartcut-app-state-v1";
const APP_STATE_VERSION = 1;

type AppPersistedState = {
  v: number;
  rows: PieceRow[];
  stockRows: StockRow[];
  kerfMm: string;
  applyMiterStock: boolean;
  result: CuttingResult | null;
  importBlankText: string;
  importSegmentText: string;
  mainTab: "map" | "params";
};

function parsePieceRowsFromStorage(x: unknown): PieceRow[] | null {
  if (!Array.isArray(x)) return null;
  const out: PieceRow[] = [];
  for (const item of x) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") return null;
    if (typeof r.label !== "string") return null;
    if (typeof r.outerMm !== "string") return null;
    if (typeof r.innerMm !== "string") return null;
    if (typeof r.qty !== "string") return null;
    out.push({
      id: r.id,
      label: r.label,
      outerMm: r.outerMm,
      innerMm: r.innerMm,
      qty: r.qty,
    });
  }
  return out;
}

function parseStockRowsFromStorage(x: unknown): StockRow[] | null {
  if (!Array.isArray(x)) return null;
  const out: StockRow[] = [];
  for (const item of x) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") return null;
    if (typeof r.lengthMm !== "string") return null;
    if (typeof r.qty !== "string") return null;
    out.push({ id: r.id, lengthMm: r.lengthMm, qty: r.qty });
  }
  return out;
}

function parsePlacedPieceFromStorage(x: unknown): PlacedPiece | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.demandId !== "string") return null;
  if (typeof o.label !== "string") return null;
  if (typeof o.lengthMm !== "number" || !Number.isFinite(o.lengthMm)) return null;
  if (typeof o.colorIndex !== "number" || !Number.isInteger(o.colorIndex))
    return null;
  return {
    demandId: o.demandId,
    label: o.label,
    lengthMm: o.lengthMm,
    colorIndex: o.colorIndex,
  };
}

function parseBarLayoutFromStorage(x: unknown): BarLayout | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.wasteMm !== "number" || !Number.isFinite(o.wasteMm)) return null;
  if (typeof o.usedMm !== "number" || !Number.isFinite(o.usedMm)) return null;
  if (typeof o.stockLengthMm !== "number" || !Number.isFinite(o.stockLengthMm))
    return null;
  if (!Array.isArray(o.pieces)) return null;
  const pieces: PlacedPiece[] = [];
  for (const p of o.pieces) {
    const pp = parsePlacedPieceFromStorage(p);
    if (!pp) return null;
    pieces.push(pp);
  }
  return {
    pieces,
    wasteMm: o.wasteMm,
    usedMm: o.usedMm,
    stockLengthMm: o.stockLengthMm,
  };
}

function parseCuttingResultFromStorage(x: unknown): CuttingResult | null {
  if (x === null) return null;
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.method !== "exact" && o.method !== "ffd") return null;
  if (typeof o.kerfMm !== "number" || !Number.isFinite(o.kerfMm)) return null;
  if (typeof o.totalStockMm !== "number" || !Number.isFinite(o.totalStockMm))
    return null;
  if (typeof o.totalUsefulMm !== "number" || !Number.isFinite(o.totalUsefulMm))
    return null;
  if (typeof o.wastePercent !== "number" || !Number.isFinite(o.wastePercent))
    return null;
  if (typeof o.totalCuts !== "number" || !Number.isInteger(o.totalCuts))
    return null;
  if (typeof o.multiStock !== "boolean") return null;
  if (!Array.isArray(o.bars)) return null;
  const bars: BarLayout[] = [];
  for (const b of o.bars) {
    const bl = parseBarLayoutFromStorage(b);
    if (!bl) return null;
    bars.push(bl);
  }
  return {
    bars,
    method: o.method,
    kerfMm: o.kerfMm,
    totalStockMm: o.totalStockMm,
    totalUsefulMm: o.totalUsefulMm,
    wastePercent: o.wastePercent,
    totalCuts: o.totalCuts,
    multiStock: o.multiStock,
  };
}

export function CuttingCalculator() {
  const [rows, setRows] = useState<PieceRow[]>(defaultRows);
  const [stockRows, setStockRows] = useState<StockRow[]>([
    { id: newId(), lengthMm: "6000", qty: "" },
  ]);
  const [kerfMm, setKerfMm] = useState("0");
  const [applyMiterStock, setApplyMiterStock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CuttingResult | null>(null);
  const [importBlankText, setImportBlankText] = useState("");
  const [importSegmentText, setImportSegmentText] = useState("");
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mainTab, setMainTab] = useState<"map" | "params">("map");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APP_STATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const p = parsed as Record<string, unknown>;
      if (p.v !== APP_STATE_VERSION) return;

      const nextRows = parsePieceRowsFromStorage(p.rows);
      if (nextRows && nextRows.length > 0) setRows(nextRows);

      const nextStock = parseStockRowsFromStorage(p.stockRows);
      if (nextStock && nextStock.length > 0) setStockRows(nextStock);

      if (typeof p.kerfMm === "string") setKerfMm(p.kerfMm);
      if (typeof p.applyMiterStock === "boolean")
        setApplyMiterStock(p.applyMiterStock);

      if ("result" in p) {
        setResult(parseCuttingResultFromStorage(p.result));
      }

      if (typeof p.importBlankText === "string")
        setImportBlankText(p.importBlankText);
      if (typeof p.importSegmentText === "string")
        setImportSegmentText(p.importSegmentText);

      if (p.mainTab === "map" || p.mainTab === "params") setMainTab(p.mainTab);
    } catch {
      // битый JSON или недоступно хранилище
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: AppPersistedState = {
        v: APP_STATE_VERSION,
        rows,
        stockRows,
        kerfMm,
        applyMiterStock,
        result,
        importBlankText,
        importSegmentText,
        mainTab,
      };
      localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // квота или режим без хранилища
    }
  }, [
    hydrated,
    rows,
    stockRows,
    kerfMm,
    applyMiterStock,
    result,
    importBlankText,
    importSegmentText,
    mainTab,
  ]);

  const miterInfo = useMemo(() => {
    let maxDeltaMm = 0;
    const perRow: { id: string; avgMm: number; deltaMm: number }[] = [];
    for (const r of rows) {
      const outer = parseLengthMm(r.outerMm);
      const inner = parseLengthMm(r.innerMm);
      if (outer == null || inner == null || inner <= 0) continue;
      const avgMm = (outer + inner) / 2;
      const deltaMm = outer - avgMm;
      maxDeltaMm = Math.max(maxDeltaMm, deltaMm);
      perRow.push({ id: r.id, avgMm, deltaMm });
    }
    return { maxDeltaMm, perRow };
  }, [rows]);

  const totalPieces = useMemo(() => {
    let s = 0;
    for (const r of rows) {
      const q = parseNum(r.qty);
      if (q != null && q > 0) s += q;
    }
    return s;
  }, [rows]);

  const uniqueLengths = useMemo(() => rows.length, [rows]);
  const segmentImportStats = useMemo(() => {
    const { rows: parsed } = parseSegmentsPaste(importSegmentText);
    const positions = parsed.length;
    let pieces = 0;
    for (const r of parsed) pieces += r.quantity;
    return { positions, pieces };
  }, [importSegmentText]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: newId(),
        label: `Тип ${prev.length + 1}`,
        outerMm: "",
        innerMm: "",
        qty: "1",
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: string, patch: Partial<PieceRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function buildDemands(): { demands: DemandItem[]; err: string | null } {
    const demands: DemandItem[] = [];
    let colorIndex = 0;
    for (const r of rows) {
      const outer = parseLengthMm(r.outerMm);
      const inner = parseLengthMm(r.innerMm);
      const q = parseNum(r.qty);
      if (outer == null || outer <= 0) {
        return { demands: [], err: "Укажите положительную длину детали (мм)." };
      }
      if (q == null || !Number.isInteger(q) || q < 1) {
        return {
          demands: [],
          err: `Количество для «${r.label}» должно быть целым числом ≥ 1.`,
        };
      }
      let lengthMm: number;
      if (inner != null && inner > 0) {
        lengthMm = Math.round((outer + inner) / 2);
      } else {
        lengthMm = outer;
      }
      demands.push({
        id: r.id,
        label: r.label.trim() || "Деталь",
        lengthMm,
        quantity: q,
        colorIndex: colorIndex++ % 8,
      });
    }
    return { demands, err: null };
  }

  function parseStockQty(raw: string): number {
    const t = raw.trim();
    if (t === "" || t === "∞") return STOCK_UNLIMITED;
    const n = parseNum(t);
    if (n == null || n < 0) return 0;
    return Math.floor(n);
  }

  function buildStockSpecs(): { specs: StockSpec[]; err: string | null } {
    if (stockRows.length === 0) {
      return { specs: [], err: "Добавьте хотя бы одну строку заготовки." };
    }
    const specs: StockSpec[] = [];
    for (let i = 0; i < stockRows.length; i++) {
      const row = stockRows[i];
      const mmLen = parseLengthMm(row.lengthMm);
      if (mmLen == null || mmLen <= 0) {
        return {
          specs: [],
          err: `Заготовка (строка ${i + 1}): укажите длину в мм.`,
        };
      }
      let effMm = mmLen;
      if (applyMiterStock && miterInfo.maxDeltaMm > 0) {
        effMm = mmLen - miterInfo.maxDeltaMm;
      }
      if (effMm <= 0) {
        return {
          specs: [],
          err:
            "После коррекции по фаскам длина заготовки получается ≤ 0 — проверьте длины.",
        };
      }
      const qty = parseStockQty(row.qty);
      if (qty !== STOCK_UNLIMITED && (qty < 1 || !Number.isInteger(qty))) {
        return {
          specs: [],
          err: `Количество заготовок (строка ${i + 1}): целое число ≥ 1 или пусто (∞).`,
        };
      }
      specs.push({
        id: row.id,
        lengthMm: effMm,
        quantity: qty,
      });
    }
    return { specs, err: null };
  }

  function addStockRow() {
    setStockRows((prev) => [
      ...prev,
      { id: newId(), lengthMm: "", qty: "" },
    ]);
  }

  function removeStockRow(id: string) {
    setStockRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)
    );
  }

  function updateStockRow(id: string, patch: Partial<StockRow>) {
    setStockRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function handleImportBlanks() {
    setError(null);
    setImportNotice(null);
    setResult(null);
    const { rows: parsed, errors } = parseBlanksPaste(importBlankText);
    if (parsed.length === 0) {
      setError(
        errors.length > 0
          ? errors[0]
          : "Нет строк с длиной и количеством. Формат: длина (мм), количество, название…"
      );
      return;
    }
    const uniq = [...new Set(parsed.map((r) => r.lengthMm))];
    setStockRows(
      parsed.map((p) => ({
        id: newId(),
        lengthMm: formatMmForInput(p.lengthMm),
        qty: p.quantity === "infinity" ? "" : String(p.quantity),
      }))
    );
    const parts = [
      `Импортировано типов заготовок: ${parsed.length} (${uniq.map((m) => `${m} мм`).join(", ")}).`,
    ];
    if (errors.length > 0) {
      parts.push(`Предупреждения: ${errors.slice(0, 3).join(" ")}`);
    }
    setImportNotice(parts.join(" "));
  }

  function applyImportedSegments(
    parsed: ImportedSegment[],
    errors: string[],
    sourceLabel: string
  ) {
    setError(null);
    if (parsed.length === 0) {
      setError(
        errors.length > 0
          ? errors[0]
          : "Нет отрезков с длиной и количеством > 0. Формат: длина (мм), количество…"
      );
      return;
    }
    const aggregated = aggregateSegmentsByLength(parsed);
    const next: PieceRow[] = aggregated.map((r) => ({
      id: newId(),
      label: r.name.trim() || `${r.lengthMm} мм`,
      outerMm: formatMmForInput(r.lengthMm),
      innerMm: "",
      qty: String(r.quantity),
    }));
    setRows(next);
    const raw = parsed.length;
    const uniq = aggregated.length;
    const parts = [
      `${sourceLabel}: строк в списке ${raw}, уникальных длин ${uniq}. Одинаковые длины объединены, количества просуммированы. В таблице длины в мм.`,
    ];
    if (uniq < raw) {
      parts.push(
        `Например, несколько строк «3812 1» дадут одну строку с количеством, равным числу таких строк.`
      );
    }
    if (errors.length > 0) {
      parts.push(`Замечания: ${errors.slice(0, 5).join(" ")}`);
    }
    setImportNotice(parts.join(" "));
  }

  function handleImportSegments() {
    setError(null);
    setImportNotice(null);
    setResult(null);
    const { rows: parsed, errors } = parseSegmentsPaste(importSegmentText);
    applyImportedSegments(parsed, errors, "Импорт из текста");
  }

  function handleCsvBlanksFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportBlankText(text);
      setImportNotice(
        "Текст файла вставлен в поле «Заготовки». Нажмите «Импорт заготовок»."
      );
    };
    reader.readAsText(file);
  }

  function handleTextSegmentsFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportSegmentText(text);
      setImportNotice(
        "Текст вставлен в поле «Отрезки». Нажмите «Импорт отрезков»."
      );
    };
    reader.readAsText(file);
  }

  function handleNewCalculation() {
    try {
      localStorage.removeItem(APP_STATE_STORAGE_KEY);
    } catch {
      // режим без хранилища
    }
    setRows(buildDefaultPieceRows());
    setStockRows([{ id: newId(), lengthMm: "6000", qty: "" }]);
    setKerfMm("0");
    setApplyMiterStock(true);
    setError(null);
    setResult(null);
    setImportBlankText("");
    setImportSegmentText("");
    setImportNotice(null);
    setMainTab("map");
  }

  async function handleSegmentsExcelFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setImportNotice(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const { parseSegmentsExcelBuffer } = await import(
        "@/lib/import-segments-excel"
      );
      const { rows: parsed, errors } = parseSegmentsExcelBuffer(buf);
      applyImportedSegments(
        parsed,
        errors,
        `Файл «${file.name}»`
      );
    } catch {
      setError("Не удалось прочитать Excel-файл.");
    }
  }

  function handleCalculate() {
    setError(null);
    setResult(null);
    const { demands, err } = buildDemands();
    if (err) {
      setError(err);
      return;
    }
    const { specs, err: stockErr } = buildStockSpecs();
    if (stockErr) {
      setError(stockErr);
      return;
    }
    const kerf = parseNum(kerfMm);
    if (kerf == null || kerf < 0) {
      setError("Ширина реза (пропил) должна быть числом ≥ 0.");
      return;
    }

    const maxStock = Math.max(...specs.map((s) => s.lengthMm));
    const v = validateDemands(maxStock, demands);
    if (v) {
      setError(v);
      return;
    }

    try {
      setResult(solveCuttingFromStocks(specs, kerf, demands));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка расчёта раскроя.");
    }
  }

  const sidebarUser = {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  };

  return (
    <div className="h-screen overflow-hidden bg-background">
      <SidebarProvider
        defaultOpen
        style={
          {
            "--sidebar-width": "28rem",
          } as CSSProperties
        }
      >
        <Sidebar
          collapsible="none"
          className="top-0 border-r border-sidebar-border"
        >
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0 text-base font-semibold tracking-tight">
                Исходные параметры
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs font-normal"
                onClick={handleNewCalculation}
              >
                Новый расчёт
              </Button>
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-1 p-2">
            <SidebarGroup>
              <div className="flex items-center justify-between px-2">
                <SidebarGroupLabel className="px-0">Отрезки</SidebarGroupLabel>
                <Badge variant="outline" className="font-normal tabular-nums">
                  поз. {segmentImportStats.positions} · дет. {segmentImportStats.pieces}
                </Badge>
              </div>
              <SidebarGroupContent className="space-y-2 px-2">
                <Textarea
                  value={importSegmentText}
                  onChange={(e) => setImportSegmentText(e.target.value)}
                  placeholder={"1429\t1\n1429\t1\n1330\t1"}
                  className="h-[120px] resize-none font-mono text-sm"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  className="w-full"
                  variant="secondary"
                  onClick={handleImportSegments}
                >
                  Импорт отрезков
                </Button>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>
                Заготовки
              </SidebarGroupLabel>
              <SidebarGroupContent className="space-y-4 px-2">
                <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-base">Заготовки (склад)</Label>
                  <Badge variant="outline" className="font-normal">
                    мм
                  </Badge>
                  <HintTip label="Несколько длин">
                    Каждая строка — свой тип заготовки. Количество пустое или ∞
                    — без лимита на складе. Алгоритм выберет наименьшую
                    подходящую длину для новой заготовки.
                  </HintTip>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStockRow}
                >
                  <Plus className="mr-1 size-4" />
                  Тип заготовки
                </Button>
              </div>
              <ScrollArea className="w-full rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Длина (мм)</TableHead>
                      <TableHead className="min-w-[100px]">
                        <span className="inline-flex items-center gap-1">
                          Кол-во
                          <HintTip label="Остаток на складе" side="bottom">
                            Целое число штук. Пусто — неограниченно для расчёта.
                          </HintTip>
                        </span>
                      </TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockRows.map((sr) => (
                      <TableRow key={sr.id}>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            placeholder="6000"
                            value={sr.lengthMm}
                            onChange={(e) =>
                              updateStockRow(sr.id, { lengthMm: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="numeric"
                            placeholder="∞"
                            value={sr.qty}
                            onChange={(e) =>
                              updateStockRow(sr.id, { qty: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                            disabled={stockRows.length <= 1}
                            onClick={() => removeStockRow(sr.id)}
                            aria-label="Удалить строку заготовки"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Пропил</SidebarGroupLabel>
              <SidebarGroupContent className="space-y-3 px-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="kerf">Ширина реза</Label>
                    <Badge
                      variant="outline"
                      className="h-5 px-1.5 text-[10px] font-normal"
                    >
                      мм
                    </Badge>
                  </div>
                  <Input
                    id="kerf"
                    inputMode="decimal"
                    value={kerfMm}
                    onChange={(e) => setKerfMm(e.target.value)}
                    placeholder="0"
                  />
                </div>
                {miterInfo.maxDeltaMm > 0 && (
                  <div className="bg-muted/40 flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      id="miter-stock"
                      checked={applyMiterStock}
                      onCheckedChange={(v) => setApplyMiterStock(v === true)}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-snug">
                      <Label
                        htmlFor="miter-stock"
                        className="cursor-pointer text-sm leading-none font-medium"
                      >
                        Коррекция заготовки по фаске
                      </Label>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Вычесть {miterInfo.maxDeltaMm.toFixed(0)} мм из длины каждой
                        заготовки.
                      </p>
                    </div>
                  </div>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 pb-2">
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={handleCalculate}
              >
                Рассчитать раскрой
              </Button>
            </div>
            <NavUser user={sidebarUser} />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="h-screen overflow-y-auto">
        <main className="space-y-4 p-4">
          <div className="space-y-3 px-2 py-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">SmartCut</h1>
              <Badge variant="secondary" className="font-normal">
                <Ruler className="mr-1 size-3" aria-hidden />
                Линейный раскрой
              </Badge>
              <Badge variant="outline" className="font-normal">
                1D · минимум заготовок
              </Badge>
              <Badge variant="outline" className="font-normal">
                <Sparkles className="mr-1 size-3" aria-hidden />
                До {MAX_EXACT_PIECES} дет. — точный алгоритм
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Подберите число заготовок и схему пропилов для стержней, труб, кабеля
              и профилей. Учтите ширину реза. Для разных углов реза выполняйте
              отдельные расчёты.
            </p>
          </div>
          <Tabs
            value={mainTab}
            onValueChange={(v) =>
              setMainTab(v === "params" ? "params" : "map")
            }
            className="gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="grid h-9 w-full max-w-md grid-cols-2">
                <TabsTrigger value="map">Карта раскроя</TabsTrigger>
                <TabsTrigger value="params">Параметры расчёта</TabsTrigger>
              </TabsList>
              <Button
                type="button"
                size="sm"
                className="gap-2 border border-[#B42822] bg-[#D93831] text-white hover:bg-[#B42822]"
                onClick={() => result && downloadCuttingPdf(result)}
                disabled={!result || result.bars.length === 0}
              >
                <FileDown className="size-4" />
                Скачать PDF
              </Button>
            </div>

            <TabsContent value="map" className="mt-0">
              {result && result.bars.length > 0 ? (
                <Card className="shadow-sm ring-1 ring-border/60">
              <CardHeader className="border-border/50 flex! flex-col gap-3 border-b pb-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <CardTitle className="text-lg leading-tight">Результат</CardTitle>
                  {/* не CardAction: у shadcn там grid-колонки, ломают flex-шапку */}
                  <div
                    data-slot="card-action"
                    className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5"
                  >
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        className="inline-flex"
                        aria-label="Про отходы"
                      >
                        <Badge variant="outline" className="cursor-help font-normal tabular-nums">
                          Отходы ~{result.wastePercent}%
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs" side="left">
                        Доля условных отходов от суммарной длины заготовок (без учёта
                        остатков на складе).
                      </TooltipContent>
                    </Tooltip>
                    <Badge variant="secondary" className="font-normal tabular-nums">
                      Пропил {result.kerfMm} мм
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {formatStockLengthsBadgeRu(
                        aggregateStockLengths(result.bars).map((x) => x.lengthMm)
                      )}
                    </Badge>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
                    <Layers className="size-3.5 shrink-0 opacity-80" aria-hidden />
                    Целые заготовки по длинам
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aggregateStockLengths(result.bars).map(({ lengthMm, count }) => (
                      <div
                        key={lengthMm}
                        className="border-border/70 bg-linear-to-b from-muted/50 to-muted/25 flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 shadow-sm ring-1 ring-border/40"
                      >
                        <span className="text-foreground text-xl font-semibold leading-none tabular-nums tracking-tight">
                          {count}
                        </span>
                        <span className="text-muted-foreground text-sm font-light">
                          ×
                        </span>
                        <span className="text-foreground text-sm font-medium tabular-nums">
                          {lengthMm.toLocaleString("ru-RU")}{" "}
                          <span className="text-muted-foreground font-normal">мм</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <CardDescription className="text-pretty">
                  Заготовок:{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {result.bars.length}
                  </span>
                  . Полезная длина:{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {Math.round(result.totalUsefulMm).toLocaleString("ru-RU")} мм
                  </span>{" "}
                  из{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {Math.round(result.totalStockMm).toLocaleString("ru-RU")} мм
                  </span>
                  . Резов: {result.totalCuts}.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {groupConsecutiveIdenticalBars(result.bars).map((g, idx) => (
                    <CuttingBarDiagram
                      key={`${g.startIndex}-${idx}`}
                      bar={g.bar}
                      kerfMm={result.kerfMm}
                      displayIndex={g.startIndex + 1}
                      repeat={g.count}
                    />
                  ))}
                </div>
              </CardContent>
                </Card>
              ) : (
                <Alert>
                  <Info className="size-4" />
                  <AlertTitle>Нет результата</AlertTitle>
                  <AlertDescription>Сначала выполните расчет кнопкой в сайдбаре.</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="params" className="mt-0">
              <Card className="shadow-sm ring-1 ring-border/60">
                <CardHeader className="border-border/50 gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="text-lg">Параметры расчета</CardTitle>
                    <CardDescription>
                      Длины деталей и пропил задаются в миллиметрах.
                    </CardDescription>
                  </div>
                  <CardAction className="flex flex-wrap justify-end gap-1.5 pt-0">
                    <Badge variant="outline" className="font-normal tabular-nums">
                      Позиций: {uniqueLengths}
                    </Badge>
                    <Badge variant="secondary" className="font-normal tabular-nums">
                      Деталей: {totalPieces}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Separator />

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label className="text-base">Детали</Label>
                        <Badge variant="outline" className="font-normal">
                          мм
                        </Badge>
                        <HintTip label="Таблица деталей">
                          Каждая строка — тип детали: длина в мм и количество штук.
                          Внутренняя длина — для фасок; иначе оставьте пустым.
                        </HintTip>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addRow}>
                        <Plus className="mr-1 size-4" />
                        Строка
                      </Button>
                    </div>

                    <ScrollArea className="h-[min(420px,55vh)] w-full rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[min(140px,28vw)]">Название</TableHead>
                            <TableHead>
                              <span className="inline-flex items-center gap-1">
                                Наруж. (мм)
                              </span>
                            </TableHead>
                            <TableHead>
                              <span className="inline-flex items-center gap-1">
                                Внутр. (мм)
                              </span>
                            </TableHead>
                            <TableHead className="w-[88px]">Кол-во</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <Input
                                  value={r.label}
                                  onChange={(e) =>
                                    updateRow(r.id, { label: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  value={r.outerMm}
                                  onChange={(e) =>
                                    updateRow(r.id, { outerMm: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="decimal"
                                  placeholder="—"
                                  value={r.innerMm}
                                  onChange={(e) =>
                                    updateRow(r.id, { innerMm: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  inputMode="numeric"
                                  value={r.qty}
                                  onChange={(e) =>
                                    updateRow(r.id, { qty: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground"
                                  disabled={rows.length <= 1}
                                  onClick={() => removeRow(r.id)}
                                  aria-label="Удалить строку"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <CircleAlert />
                      <AlertTitle>Ошибка</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
