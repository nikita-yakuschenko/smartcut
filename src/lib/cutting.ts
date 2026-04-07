/** Линейный раскрой: длины в миллиметрах (целые), ширина реза — между соседними деталями на одной заготовке. */

export type DemandItem = {
  id: string;
  label: string;
  lengthMm: number;
  quantity: number;
  /** индекс цвета в палитре */
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
  /** остаток на заготовке после последней детали */
  wasteMm: number;
  /** занято по длине деталей + пропилы */
  usedMm: number;
};

export type CuttingResult = {
  bars: BarLayout[];
  method: "exact" | "ffd";
  /** длина заготовки, использованная в расчёте (мм) */
  stockLengthMm: number;
  kerfMm: number;
  totalStockMm: number;
  totalUsefulMm: number;
  wastePercent: number;
};

const EPS = 0.001;

function barUsedMm(pieces: PlacedPiece[], kerfMm: number): number {
  if (pieces.length === 0) return 0;
  let u = 0;
  for (let i = 0; i < pieces.length; i++) {
    u += pieces[i].lengthMm;
    if (i < pieces.length - 1) u += kerfMm;
  }
  return u;
}

function expandDemands(demands: DemandItem[]): PlacedPiece[] {
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

/** First Fit Decreasing — быстрый baseline. */
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
    };
  });
}

function cloneBars(b: PlacedPiece[][]): PlacedPiece[][] {
  return b.map((bar) => bar.slice());
}

/** Точный поиск минимального числа заготовок (ветвление по размещению следующей детали). */
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

/** Максимум деталей для точного перебора минимума заготовок. */
export const MAX_EXACT_PIECES = 22;

function fmtMm(mm: number): string {
  if (mm >= 10 && mm % 10 === 0) return `${mm / 10} см`;
  return `${mm} мм`;
}

export function validateDemands(
  stockLengthMm: number,
  demands: DemandItem[]
): string | null {
  for (const d of demands) {
    if (d.quantity > 0 && d.lengthMm > stockLengthMm) {
      return `Деталь «${d.label}» (${fmtMm(d.lengthMm)}) длиннее заготовки (${fmtMm(stockLengthMm)}).`;
    }
  }
  return null;
}

export function solveCutting(
  stockLengthMm: number,
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
      stockLengthMm,
      kerfMm,
      totalStockMm: 0,
      totalUsefulMm: 0,
      wastePercent: 0,
    };
  }

  let barsRaw: PlacedPiece[][];
  let method: "exact" | "ffd";

  if (totalPieces <= MAX_EXACT_PIECES) {
    const sorted = expandDemands(demands);
    const exact = solveExactMinBars(stockLengthMm, kerfMm, sorted);
    if (exact) {
      barsRaw = exact;
      method = "exact";
    } else {
      barsRaw = solveFFD(stockLengthMm, kerfMm, demands).map((b) => b.pieces);
      method = "ffd";
    }
  } else {
    barsRaw = solveFFD(stockLengthMm, kerfMm, demands).map((b) => b.pieces);
    method = "ffd";
  }

  const bars: BarLayout[] = barsRaw.map((pieces) => {
    const usedMm = barUsedMm(pieces, kerfMm);
    return {
      pieces,
      usedMm,
      wasteMm: Math.max(0, stockLengthMm - usedMm),
    };
  });

  const totalStockMm = bars.length * stockLengthMm;
  const wastePercent =
    totalStockMm > 0
      ? Math.round(
          ((totalStockMm - totalUsefulMm) / totalStockMm) * 1000
        ) / 10
      : 0;

  return {
    bars,
    method,
    stockLengthMm,
    kerfMm,
    totalStockMm,
    totalUsefulMm,
    wastePercent,
  };
}

/** Позиции границ деталей (мм от начала): после каждой детали — линия реза перед пропилом. */
export function segmentBoundariesMm(bar: BarLayout, kerfMm: number): number[] {
  const pos: number[] = [];
  let x = 0;
  for (let i = 0; i < bar.pieces.length; i++) {
    x += bar.pieces[i].lengthMm;
    if (i < bar.pieces.length - 1) {
      pos.push(x); // метка реза перед зоной пропила
      x += kerfMm;
    }
  }
  return pos;
}
