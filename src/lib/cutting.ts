/** Линейный раскрой: длины в мм, пропил между деталями на одной заготовке. */

export type DemandItem = {
  id: string;
  label: string;
  lengthMm: number;
  quantity: number;
  colorIndex: number;
};

export type PlacedPiece = {
  demandId: string;
  label: string;
  lengthMm: number;
  colorIndex: number;
};

export type BarLayout = {
  pieces: PlacedPiece[];
  wasteMm: number;
  usedMm: number;
  /** длина этой заготовки (мм) — при нескольких типах на складе различается */
  stockLengthMm: number;
};

export type CuttingResult = {
  bars: BarLayout[];
  method: "exact" | "ffd";
  kerfMm: number;
  totalStockMm: number;
  totalUsefulMm: number;
  wastePercent: number;
  /** число пропилов (резов между деталями) */
  totalCuts: number;
  /** несколько разных длин заготовок в расчёте */
  multiStock: boolean;
};

export type StockSpec = {
  id: string;
  lengthMm: number;
  /** лимит заготовок этого размера; 1e9 = по сути без лимита */
  quantity: number;
};

const EPS = 0.001;
export const STOCK_UNLIMITED = 1_000_000_000;

export const MAX_EXACT_PIECES = 22;

function barUsedMm(pieces: PlacedPiece[], kerfMm: number): number {
  if (pieces.length === 0) return 0;
  let u = 0;
  for (let i = 0; i < pieces.length; i++) {
    u += pieces[i].lengthMm;
    if (i < pieces.length - 1) u += kerfMm;
  }
  return u;
}

export function expandDemands(demands: DemandItem[]): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (const d of demands) {
    for (let q = 0; q < d.quantity; q++) {
      out.push({
        demandId: d.id,
        label: d.label,
        lengthMm: d.lengthMm,
        colorIndex: d.colorIndex,
      });
    }
  }
  return out.sort((a, b) => b.lengthMm - a.lengthMm);
}

function fmtMm(mm: number): string {
  return `${Math.round(mm)} мм`;
}

export function validateDemands(
  maxStockLengthMm: number,
  demands: DemandItem[]
): string | null {
  for (const d of demands) {
    if (d.quantity > 0 && d.lengthMm > maxStockLengthMm) {
      return `Деталь «${d.label}» (${fmtMm(d.lengthMm)}) длиннее самой длинной заготовки (${fmtMm(maxStockLengthMm)}).`;
    }
  }
  return null;
}

/** Объединяет одинаковые длины заготовок, суммируя количество. */
export function mergeStockSpecs(stocks: StockSpec[]): StockSpec[] {
  const m = new Map<number, number>();
  for (const s of stocks) {
    m.set(s.lengthMm, (m.get(s.lengthMm) ?? 0) + s.quantity);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lengthMm, quantity]) => ({
      id: `stock-${lengthMm}`,
      lengthMm,
      quantity,
    }));
}

export function solveFFD(
  stockLengthMm: number,
  kerfMm: number,
  demands: DemandItem[]
): BarLayout[] {
  const items = expandDemands(demands);
  const bars: PlacedPiece[][] = [];

  for (const item of items) {
    let placed = false;
    for (const bar of bars) {
      const used = barUsedMm(bar, kerfMm);
      const add = used > 0 ? kerfMm + item.lengthMm : item.lengthMm;
      if (used + add <= stockLengthMm + EPS) {
        bar.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) bars.push([item]);
  }

  return bars.map((pieces) => {
    const usedMm = barUsedMm(pieces, kerfMm);
    return {
      pieces,
      usedMm,
      wasteMm: Math.max(0, stockLengthMm - usedMm),
      stockLengthMm,
    };
  });
}

function cloneBars(b: PlacedPiece[][]): PlacedPiece[][] {
  return b.map((bar) => bar.slice());
}

function solveExactMinBars(
  stockLengthMm: number,
  kerfMm: number,
  itemsSorted: PlacedPiece[]
): PlacedPiece[][] | null {
  let best: PlacedPiece[][] | null = null;
  let bestCount = Infinity;

  function dfs(remaining: PlacedPiece[], bars: PlacedPiece[][]) {
    if (remaining.length === 0) {
      if (bars.length < bestCount) {
        bestCount = bars.length;
        best = cloneBars(bars);
      }
      return;
    }
    if (bars.length >= bestCount) return;

    const next = remaining[0];
    const rest = remaining.slice(1);

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const u = barUsedMm(bar, kerfMm);
      const add = u > 0 ? kerfMm + next.lengthMm : next.lengthMm;
      if (u + add <= stockLengthMm + EPS) {
        bar.push(next);
        dfs(rest, bars);
        bar.pop();
      }
    }

    bars.push([next]);
    dfs(rest, bars);
    bars.pop();
  }

  dfs(itemsSorted, []);
  return best;
}

type OpenBar = {
  stockId: string;
  stockLengthMm: number;
  pieces: PlacedPiece[];
};

/** FFD с несколькими длинами заготовок: новая заготовка — наименьшая подходящая длина с остатком на складе. */
export function solveMultiStockFFD(
  stocks: StockSpec[],
  kerfMm: number,
  demands: DemandItem[]
): BarLayout[] {
  const merged = mergeStockSpecs(stocks);
  const items = expandDemands(demands);
  const sortedAsc = [...merged].sort((a, b) => a.lengthMm - b.lengthMm);
  const remaining = new Map<string, number>();
  for (const s of merged) {
    remaining.set(s.id, s.quantity);
  }

  const openBars: OpenBar[] = [];

  function takeStockForNewBar(pieceLengthMm: number): StockSpec | null {
    for (const s of sortedAsc) {
      if (s.lengthMm + EPS < pieceLengthMm) continue;
      const left = remaining.get(s.id) ?? 0;
      if (left <= 0) continue;
      return s;
    }
    return null;
  }

  for (const item of items) {
    let placed = false;
    for (const ob of openBars) {
      const used = barUsedMm(ob.pieces, kerfMm);
      const add = used > 0 ? kerfMm + item.lengthMm : item.lengthMm;
      if (used + add <= ob.stockLengthMm + EPS) {
        ob.pieces.push(item);
        placed = true;
        break;
      }
    }
    if (placed) continue;

    const stock = takeStockForNewBar(item.lengthMm);
    if (!stock) {
      throw new Error(
        `Нет заготовки для детали ${item.lengthMm} мм (проверьте длины и количество на складе).`
      );
    }
    const left = remaining.get(stock.id)!;
    // «Без лимита» — большие числа; уменьшаем только реальные малые остатки
    if (left <= 1_000_000) {
      remaining.set(stock.id, left - 1);
    }
    openBars.push({
      stockId: stock.id,
      stockLengthMm: stock.lengthMm,
      pieces: [item],
    });
  }

  return openBars.map((ob) => {
    const usedMm = barUsedMm(ob.pieces, kerfMm);
    return {
      pieces: ob.pieces,
      usedMm,
      wasteMm: Math.max(0, ob.stockLengthMm - usedMm),
      stockLengthMm: ob.stockLengthMm,
    };
  });
}

function totalCutsCount(bars: BarLayout[]): number {
  return bars.reduce(
    (s, b) => s + Math.max(0, b.pieces.length - 1),
    0
  );
}

function finalizeResult(
  bars: BarLayout[],
  method: "exact" | "ffd",
  kerfMm: number,
  totalUsefulMm: number,
  multiStock: boolean
): CuttingResult {
  const totalStockMm = bars.reduce((s, b) => s + b.stockLengthMm, 0);
  const wastePercent =
    totalStockMm > 0
      ? Math.round(((totalStockMm - totalUsefulMm) / totalStockMm) * 1000) /
        10
      : 0;
  return {
    bars,
    method,
    kerfMm,
    totalStockMm,
    totalUsefulMm,
    wastePercent,
    totalCuts: totalCutsCount(bars),
    multiStock,
  };
}

/**
 * Универсальный расчёт: одна длина (точный или FFD) или несколько длин (FFD).
 */
export function solveCuttingFromStocks(
  stocks: StockSpec[],
  kerfMm: number,
  demands: DemandItem[]
): CuttingResult {
  const totalPieces = demands.reduce((s, d) => s + d.quantity, 0);
  const totalUsefulMm = demands.reduce(
    (s, d) => s + d.lengthMm * d.quantity,
    0
  );

  if (totalPieces === 0) {
    return {
      bars: [],
      method: "ffd",
      kerfMm,
      totalStockMm: 0,
      totalUsefulMm: 0,
      wastePercent: 0,
      totalCuts: 0,
      multiStock: false,
    };
  }

  const merged = mergeStockSpecs(stocks);
  const maxL = Math.max(...merged.map((s) => s.lengthMm));

  if (merged.length === 1) {
    const L = merged[0].lengthMm;
    let barsRaw: PlacedPiece[][];
    let method: "exact" | "ffd";

    if (totalPieces <= MAX_EXACT_PIECES) {
      const sorted = expandDemands(demands);
      const exact = solveExactMinBars(L, kerfMm, sorted);
      if (exact) {
        barsRaw = exact;
        method = "exact";
      } else {
        barsRaw = solveFFD(L, kerfMm, demands).map((b) => b.pieces);
        method = "ffd";
      }
    } else {
      barsRaw = solveFFD(L, kerfMm, demands).map((b) => b.pieces);
      method = "ffd";
    }

    const bars: BarLayout[] = barsRaw.map((pieces) => {
      const usedMm = barUsedMm(pieces, kerfMm);
      return {
        pieces,
        usedMm,
        wasteMm: Math.max(0, L - usedMm),
        stockLengthMm: L,
      };
    });

    return finalizeResult(bars, method, kerfMm, totalUsefulMm, false);
  }

  const bars = solveMultiStockFFD(merged, kerfMm, demands);
  return finalizeResult(bars, "ffd", kerfMm, totalUsefulMm, true);
}

/** @deprecated используйте solveCuttingFromStocks; оставлено для совместимости */
export function solveCutting(
  stockLengthMm: number,
  kerfMm: number,
  demands: DemandItem[]
): CuttingResult {
  return solveCuttingFromStocks(
    [
      {
        id: "single",
        lengthMm: stockLengthMm,
        quantity: STOCK_UNLIMITED,
      },
    ],
    kerfMm,
    demands
  );
}

/** Ключ схемы раскроя (длина заготовки + длины деталей по порядку). */
export function barPatternKey(bar: BarLayout): string {
  return `${bar.stockLengthMm}|${bar.pieces.map((p) => p.lengthMm).join(",")}`;
}

/** Подряд идущие одинаковые схемы → одна строка с множителем (как «62×»). */
export function groupConsecutiveIdenticalBars(
  bars: BarLayout[]
): { count: number; bar: BarLayout; startIndex: number }[] {
  if (bars.length === 0) return [];
  const out: { count: number; bar: BarLayout; startIndex: number }[] = [];
  let i = 0;
  while (i < bars.length) {
    const key = barPatternKey(bars[i]);
    let count = 1;
    let j = i + 1;
    while (j < bars.length && barPatternKey(bars[j]) === key) {
      count++;
      j++;
    }
    out.push({ count, bar: bars[i], startIndex: i });
    i = j;
  }
  return out;
}

/** Кумулятивные позиции концов деталей по заготовке (мм от начала). */
export function cumulativePositionsMm(bar: BarLayout, kerfMm: number): number[] {
  const pos: number[] = [];
  let x = 0;
  for (let i = 0; i < bar.pieces.length; i++) {
    x += bar.pieces[i].lengthMm;
    pos.push(x);
    if (i < bar.pieces.length - 1) x += kerfMm;
  }
  return pos;
}

export function segmentBoundariesMm(bar: BarLayout, kerfMm: number): number[] {
  const pos: number[] = [];
  let x = 0;
  for (let i = 0; i < bar.pieces.length; i++) {
    x += bar.pieces[i].lengthMm;
    if (i < bar.pieces.length - 1) {
      pos.push(x);
      x += kerfMm;
    }
  }
  return pos;
}
