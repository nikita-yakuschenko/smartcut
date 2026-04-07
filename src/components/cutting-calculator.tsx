"use client";

import { useMemo, useState, type ChangeEvent } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import {
  aggregateSegmentsByLength,
  EXAMPLE_BLANKS,
  EXAMPLE_SEGMENTS,
  mmToCmInput,
  parseBlanksPaste,
  parseSegmentsPaste,
  type ImportedSegment,
} from "@/lib/import-parse";
import {
  MAX_EXACT_PIECES,
  solveCutting,
  validateDemands,
  type CuttingResult,
  type DemandItem,
} from "@/lib/cutting";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Info,
  ListPlus,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
} from "lucide-react";

function newId() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type PieceRow = {
  id: string;
  label: string;
  /** наружная длина, см */
  outerCm: string;
  /** внутренняя длина, см — опционально */
  innerCm: string;
  qty: string;
};

function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** см → мм (1 см = 10 мм) */
function cmToMm(cm: number): number {
  return Math.round(cm * 10);
}

const defaultRows: PieceRow[] = [
  {
    id: newId(),
    label: "Тип A",
    outerCm: "77",
    innerCm: "",
    qty: "1",
  },
  {
    id: newId(),
    label: "Тип B",
    outerCm: "57",
    innerCm: "",
    qty: "1",
  },
];

export function CuttingCalculator() {
  const [rows, setRows] = useState<PieceRow[]>(defaultRows);
  const [stockCm, setStockCm] = useState("200");
  const [kerfMm, setKerfMm] = useState("0");
  const [applyMiterStock, setApplyMiterStock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CuttingResult | null>(null);
  const [importBlankText, setImportBlankText] = useState("");
  const [importSegmentText, setImportSegmentText] = useState("");
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const miterInfo = useMemo(() => {
    let maxDeltaCm = 0;
    const perRow: { id: string; avgCm: number; deltaCm: number }[] = [];
    for (const r of rows) {
      const outer = parseNum(r.outerCm);
      const inner = parseNum(r.innerCm);
      if (outer == null || inner == null || inner <= 0) continue;
      const avgCm = (outer + inner) / 2;
      const deltaCm = outer - avgCm;
      maxDeltaCm = Math.max(maxDeltaCm, deltaCm);
      perRow.push({ id: r.id, avgCm, deltaCm });
    }
    const stockCmNum = parseNum(stockCm);
    const effectiveStockCm =
      stockCmNum != null && applyMiterStock && maxDeltaCm > 0
        ? stockCmNum - maxDeltaCm
        : stockCmNum;
    return { maxDeltaCm, perRow, effectiveStockCm };
  }, [rows, stockCm, applyMiterStock]);

  const totalPieces = useMemo(() => {
    let s = 0;
    for (const r of rows) {
      const q = parseNum(r.qty);
      if (q != null && q > 0) s += q;
    }
    return s;
  }, [rows]);

  const uniqueLengths = useMemo(() => rows.length, [rows]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: newId(),
        label: `Тип ${prev.length + 1}`,
        outerCm: "",
        innerCm: "",
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
      const outer = parseNum(r.outerCm);
      const inner = parseNum(r.innerCm);
      const q = parseNum(r.qty);
      if (outer == null || outer <= 0) {
        return { demands: [], err: "Укажите положительную длину детали (см)." };
      }
      if (q == null || !Number.isInteger(q) || q < 1) {
        return {
          demands: [],
          err: `Количество для «${r.label}» должно быть целым числом ≥ 1.`,
        };
      }
      let lengthMm: number;
      if (inner != null && inner > 0) {
        const avgCm = (outer + inner) / 2;
        lengthMm = cmToMm(avgCm);
      } else {
        lengthMm = cmToMm(outer);
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
    const first = parsed[0];
    setStockCm(mmToCmInput(first.lengthMm));
    const uniq = [...new Set(parsed.map((r) => r.lengthMm))];
    const parts = [
      `Импортировано заготовок: ${parsed.length}. Для расчёта задана длина: ${mmToCmInput(first.lengthMm)} см (${first.lengthMm} мм).`,
    ];
    if (uniq.length > 1) {
      parts.push(
        `На складе указано несколько длин (${uniq.map((m) => `${m} мм`).join(", ")}). Сейчас раскрой считается для одной заготовки — взята первая строка вставки.`
      );
    }
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
      outerCm: mmToCmInput(r.lengthMm),
      innerCm: "",
      qty: String(r.quantity),
    }));
    setRows(next);
    const raw = parsed.length;
    const uniq = aggregated.length;
    const parts = [
      `${sourceLabel}: строк в списке ${raw}, уникальных длин ${uniq}. Одинаковые длины объединены, количества просуммированы. В таблице длины в см (из мм).`,
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
    const stockCmNum = parseNum(stockCm);
    const kerf = parseNum(kerfMm);
    if (stockCmNum == null || stockCmNum <= 0) {
      setError("Укажите длину заготовки (см).");
      return;
    }
    if (kerf == null || kerf < 0) {
      setError("Ширина реза (пропил) должна быть числом ≥ 0.");
      return;
    }

    let stockMm = cmToMm(stockCmNum);
    if (applyMiterStock && miterInfo.maxDeltaCm > 0) {
      stockMm = cmToMm(stockCmNum - miterInfo.maxDeltaCm);
    }

    const v = validateDemands(stockMm, demands);
    if (v) {
      setError(v);
      return;
    }

    setResult(solveCutting(stockMm, kerf, demands));
  }

  return (
    <div className="min-h-full bg-linear-to-b from-background via-background to-muted/25">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 md:gap-10 md:px-6 md:py-12">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
                SmartCut
              </h1>
              <Badge variant="secondary" className="font-normal">
                <Ruler className="mr-1 size-3" aria-hidden />
                Линейный раскрой
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-normal">
                1D · минимум заготовок
              </Badge>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  className="inline-flex"
                  aria-label="О точном расчёте"
                >
                  <Badge variant="outline" className="cursor-help font-normal">
                    <Sparkles className="mr-1 size-3" aria-hidden />
                    До {MAX_EXACT_PIECES} дет. — точный алгоритм
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="bottom">
                  При суммарном числе деталей не больше {MAX_EXACT_PIECES}{" "}
                  подбирается минимальное число заготовок; иначе — быстрая
                  эвристика FFD.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-muted-foreground max-w-3xl text-[15px] leading-relaxed md:text-base">
              Подберите число заготовок и схему пропилов для стержней, труб,
              кабеля, профилей. Учтите ширину реза. Для разных углов реза
              выполняйте отдельные расчёты.
            </p>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
        <Collapsible defaultOpen className="w-full">
          <CollapsibleTrigger className="flex w-full flex-col gap-0 text-left transition-colors hover:bg-muted/40">
            <CardHeader className="border-border/60 gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <ListPlus className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Импорт данных</CardTitle>
                  <CardDescription className="line-clamp-2 sm:line-clamp-none">
                    Вставка из буфера или файла — длины отрезков в миллиметрах
                  </CardDescription>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <Badge variant="outline" className="font-normal">
                  Таблица
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  XLSX
                </Badge>
                <ChevronDown className="text-muted-foreground size-5 shrink-0" aria-hidden />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-2 pb-6">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Вставьте данные по одной строке: формат{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-xs">
                  длина количество
                </code>{" "}
                или{" "}
                <code className="bg-muted rounded px-1 py-0.5 text-xs">
                  длина количество название
                </code>{" "}
                — колонки из Excel разделяются табуляцией или пробелами. Затем
                нажмите соответствующую кнопку импорта.{" "}
                <strong>Длины в списке отрезков — в миллиметрах.</strong>{" "}
                Повторяющиеся длины при импорте объединяются: количества
                суммируются.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <button
                  type="button"
                  className="text-primary font-medium underline-offset-4 hover:underline"
                  onClick={() => {
                    setImportBlankText(EXAMPLE_BLANKS);
                    setImportSegmentText(EXAMPLE_SEGMENTS);
                  }}
                >
                  Пример
                </button>
                <label className="text-primary cursor-pointer font-medium underline-offset-4 hover:underline">
                  Файл для заготовок (CSV, TXT)
                  <input
                    type="file"
                    accept=".csv,.txt,text/csv"
                    className="sr-only"
                    onChange={handleCsvBlanksFile}
                  />
                </label>
                <label className="text-primary cursor-pointer font-medium underline-offset-4 hover:underline">
                  Файл отрезков текстом (CSV, TXT)
                  <input
                    type="file"
                    accept=".csv,.txt,text/csv"
                    className="sr-only"
                    onChange={handleTextSegmentsFile}
                  />
                </label>
                <label className="text-primary cursor-pointer font-medium underline-offset-4 hover:underline">
                  Отрезки из Excel (XLSX, XLS)
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    onChange={(ev) => {
                      void handleSegmentsExcelFile(ev);
                    }}
                  />
                </label>
              </div>
              <p className="text-muted-foreground text-xs">
                Excel для отрезков: первый лист, колонка A — длина (мм), B —
                количество (если пусто — по 1 шт. на строку). Можно вставить те
                же данные из Excel в поле ниже (копированием).
              </p>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-medium tracking-wide uppercase">
                  <span>
                    Длина заготовки <span className="text-destructive">*</span>
                  </span>
                  <span>
                    Количество <span className="text-destructive">*</span> 0–∞
                  </span>
                  <span>Название</span>
                  <span>Очерёдность</span>
                  <span>Материал</span>
                  <span>Стоимость</span>
                </div>
                <Label className="text-foreground font-medium">
                  Заготовки / склад
                </Label>
                <Textarea
                  value={importBlankText}
                  onChange={(e) => setImportBlankText(e.target.value)}
                  placeholder={
                    "6000\t5\tТруба\n12000\t0\tТруба2\n(длина в мм, табуляция или пробелы)"
                  }
                  className="min-h-[120px] font-mono text-sm"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleImportBlanks}
                >
                  Импорт заготовок
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-medium tracking-wide uppercase">
                  <span>
                    Длина отрезка <span className="text-destructive">*</span>
                  </span>
                  <span>
                    Количество <span className="text-destructive">*</span>
                  </span>
                  <span>Название</span>
                  <span>Материал</span>
                </div>
                <Label className="text-foreground font-medium">Отрезки</Label>
                <Textarea
                  value={importSegmentText}
                  onChange={(e) => setImportSegmentText(e.target.value)}
                  placeholder={
                    "1429\t1\n1429\t1\n1330\t1\n… (табуляция; длина в мм, одна строка — одна или несколько штук по колонке B)"
                  }
                  className="min-h-[160px] font-mono text-sm"
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
              </div>

              {importNotice && (
                <Alert className="border-primary/30 bg-primary/5">
                  <CheckCircle2 className="text-primary" />
                  <AlertTitle>Готово</AlertTitle>
                  <AlertDescription className="text-foreground/90">
                    {importNotice}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="border-border/50 gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">Исходные данные</CardTitle>
              <CardDescription>
                Длины деталей и заготовки — в сантиметрах. Наружная и внутренняя
                длина под углом: в расчёт входит{" "}
                <strong>средняя</strong> длина.
              </CardDescription>
            </div>
            <CardAction className="flex flex-wrap justify-end gap-1.5 pt-0">
              <Badge variant="outline" className="font-normal tabular-nums">
                Позиций: {uniqueLengths}
              </Badge>
              <Badge variant="secondary" className="font-normal tabular-nums">
                Деталей: {totalPieces}
              </Badge>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  className="inline-flex"
                  aria-label="Про единицы"
                >
                  <Badge variant="outline" className="cursor-help font-normal">
                    см / мм
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" side="left">
                  В таблице ниже длины в сантиметрах (1 см = 10 мм). Пропил
                  задаётся в миллиметрах.
                </TooltipContent>
              </Tooltip>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="stock">Длина одной заготовки</Label>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                    см
                  </Badge>
                  <HintTip label="Длина заготовки">
                    Укажите длину в сантиметрах: например 600 — это 6 м, 198 —
                    1,98 м.
                  </HintTip>
                </div>
                <Input
                  id="stock"
                  inputMode="decimal"
                  value={stockCm}
                  onChange={(e) => setStockCm(e.target.value)}
                  placeholder="например 200"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="kerf">Пропил</Label>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                    мм
                  </Badge>
                  <HintTip label="Что такое пропил">
                    Ширина реза между соседними деталями на одной заготовке;
                    материал снимается при каждом пропиле. Для расчёта без потерь
                    на рез укажите 0.
                  </HintTip>
                </div>
                <Input
                  id="kerf"
                  inputMode="decimal"
                  value={kerfMm}
                  onChange={(e) => setKerfMm(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {miterInfo.maxDeltaCm > 0 && (
              <div className="bg-muted/40 flex items-start gap-3 rounded-lg border p-4">
                <Checkbox
                  id="miter-stock"
                  checked={applyMiterStock}
                  onCheckedChange={(v) => setApplyMiterStock(v === true)}
                  className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-snug">
                  <Label
                    htmlFor="miter-stock"
                    className="cursor-pointer text-sm leading-none font-medium"
                  >
                    Укоротить заготовку на max (наружная − средняя)
                  </Label>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Эффективная длина ≈{" "}
                    {miterInfo.effectiveStockCm != null
                      ? `${miterInfo.effectiveStockCm.toFixed(2)} см`
                      : "—"}{" "}
                    (исходная {stockCm} см − {miterInfo.maxDeltaCm.toFixed(2)} см).
                    Подходит для косых резов с одинаковым углом.
                  </p>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-base">Детали</Label>
                  <Badge variant="outline" className="font-normal">
                    см
                  </Badge>
                  <HintTip label="Таблица деталей">
                    Каждая строка — тип детали: длина в см и количество штук.
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
                          Наруж. (см)
                          <HintTip label="Наружняя длина детали после реза" side="bottom">
                            Длина по внешней стороне; при фаске заполните также
                            «Внутр.».
                          </HintTip>
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-1">
                          Внутр. (см)
                          <HintTip label="Внутренняя длина" side="bottom">
                            Необязательно. Если указано вместе с наружней, в
                            расчёт идёт средняя длина.
                          </HintTip>
                        </span>
                      </TableHead>
                      <TableHead className="w-[88px]">
                        <span className="inline-flex items-center gap-1">
                          Кол-во
                          <HintTip label="Количество одинаковых деталей" side="bottom">
                            Целое число штук для этой строки.
                          </HintTip>
                        </span>
                      </TableHead>
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
                            value={r.outerCm}
                            onChange={(e) =>
                              updateRow(r.id, { outerCm: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            placeholder="—"
                            value={r.innerCm}
                            onChange={(e) =>
                              updateRow(r.id, { innerCm: e.target.value })
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

            <Button type="button" size="lg" className="w-full sm:w-auto" onClick={handleCalculate}>
              Рассчитать раскрой
            </Button>

            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Подсказки</CardTitle>
                <Badge variant="secondary" className="font-normal">
                  Советы
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-4 text-sm leading-relaxed">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    Углы
                  </Badge>
                  <strong className="text-foreground font-medium">
                    Разные углы реза
                  </strong>
                </div>
                <p>
                  Две группы косых резов (например 30° и 60°) —{" "}
                  <strong className="text-foreground">два расчёта</strong>. Один
                  угол у всех — один расчёт.
                </p>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    Фаски
                  </Badge>
                  <strong className="text-foreground font-medium">
                    Наружняя / внутренняя
                  </strong>
                </div>
                <p>
                  Обе длины — в расчёт средняя; коррекция заготовки по max
                  (наружняя − средняя).
                </p>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    Алгоритм
                  </Badge>
                  <strong className="text-foreground font-medium">
                    Точность
                  </strong>
                </div>
                <p>
                  До {MAX_EXACT_PIECES} деталей суммарно — точный перебор;
                  больше — эвристика FFD.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {result && result.bars.length > 0 && (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="border-border/50 gap-4 border-b pb-4 sm:flex-row sm:items-start">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">Результат</CardTitle>
                <Badge
                  variant={
                    result.method === "exact" ? "default" : "secondary"
                  }
                  className="font-normal"
                >
                  {result.method === "exact"
                    ? "Точный минимум"
                    : "Эвристика FFD"}
                </Badge>
              </div>
              <CardDescription>
                Заготовок:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {result.bars.length}
                </span>
                . Полезный метраж:{" "}
                {(result.totalUsefulMm / 1000).toFixed(2)} м из{" "}
                {(result.totalStockMm / 1000).toFixed(2)} м.
              </CardDescription>
            </div>
            <CardAction className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:min-w-[200px] sm:items-end">
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  className="inline-flex w-full justify-end sm:w-auto"
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
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge variant="secondary" className="font-normal tabular-nums">
                  Пропил {result.kerfMm} мм
                </Badge>
                <Badge variant="outline" className="font-normal tabular-nums">
                  Заготовка {(result.stockLengthMm / 1000).toFixed(3)} м
                </Badge>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs defaultValue="diagrams" className="gap-4">
              <TabsList className="grid h-9 w-full max-w-md grid-cols-2">
                <TabsTrigger value="diagrams">Схемы</TabsTrigger>
                <TabsTrigger value="table">Сводка</TabsTrigger>
              </TabsList>
              <TabsContent value="diagrams" className="mt-4 space-y-8">
                {result.bars.map((bar, i) => (
                  <CuttingBarDiagram
                    key={i}
                    bar={bar}
                    stockLengthMm={result.stockLengthMm}
                    kerfMm={result.kerfMm}
                    barIndex={i}
                  />
                ))}
              </TabsContent>
              <TabsContent value="table" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>№ заготовки</TableHead>
                      <TableHead>Детали по порядку</TableHead>
                      <TableHead className="text-right">Остаток, мм</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.bars.map((bar, i) => (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          {bar.pieces.map((p) => p.label).join(" → ")}
                        </TableCell>
                        <TableCell className="text-right">
                          {bar.wasteMm.toFixed(0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {result && result.bars.length === 0 && (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Нет деталей</AlertTitle>
          <AlertDescription>Добавьте хотя бы одну деталь.</AlertDescription>
        </Alert>
      )}
      </div>
    </div>
  );
}
