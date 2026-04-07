"use client";

import { Fragment } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import { Badge } from "@/components/ui/badge";
import type { BarLayout, PlacedPiece } from "@/lib/cutting";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.55 0.2 280)",
  "oklch(0.6 0.18 200)",
  "oklch(0.65 0.15 140)",
];

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

function aggregatePiecesForLegend(pieces: PlacedPiece[]) {
  const map = new Map<
    string,
    { label: string; lengthMm: number; colorIndex: number; count: number }
  >();
  for (const p of pieces) {
    const prev = map.get(p.demandId);
    if (!prev) {
      map.set(p.demandId, {
        label: p.label,
        lengthMm: p.lengthMm,
        colorIndex: p.colorIndex,
        count: 1,
      });
    } else {
      prev.count += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.lengthMm - a.lengthMm);
}

/** Центр каждого пропила и накопленная координата до него (мм от начала заготовки). */
function cutCenterLeaders(
  bar: BarLayout,
  kerfMm: number
): { centerMm: number; valueMm: number }[] {
  const wasteMm = Math.max(0, bar.wasteMm);
  const n = bar.pieces.length;
  const out: { centerMm: number; valueMm: number }[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    x += bar.pieces[i].lengthMm;
    const hasKerfAfter = i < n - 1 || wasteMm > 0;
    if (hasKerfAfter) {
      const center = x + kerfMm / 2;
      out.push({ centerMm: center, valueMm: center });
      x += kerfMm;
    }
  }
  return out;
}

/** Убираем выноски, если центры слишком близко по ширине бара. */
function filterLeadersByGap(
  items: { centerMm: number; valueMm: number }[],
  stockLengthMm: number,
  minGapFrac: number
): { centerMm: number; valueMm: number }[] {
  if (stockLengthMm <= 0 || items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.centerMm - b.centerMm);
  const out: { centerMm: number; valueMm: number }[] = [];
  let lastFrac = -Infinity;
  for (const it of sorted) {
    const f = it.centerMm / stockLengthMm;
    if (out.length === 0 || f - lastFrac >= minGapFrac) {
      out.push(it);
      lastFrac = f;
    }
  }
  const lastVal = sorted[sorted.length - 1];
  if (lastVal != null && out[out.length - 1]?.centerMm !== lastVal.centerMm) {
    out.push(lastVal);
  }
  return out;
}

/** Близкие по горизонтали выноски — на разной высоте (чередование), чтобы не перекрывали текст. */
function staggerLeaders(
  items: { centerMm: number; valueMm: number }[],
  stockLengthMm: number
): { centerMm: number; valueMm: number; lane: 0 | 1 }[] {
  if (items.length === 0 || stockLengthMm <= 0) return [];
  const sorted = [...items].sort((a, b) => a.centerMm - b.centerMm);
  const proximityMm = Math.max(150, stockLengthMm * 0.035);
  const out: { centerMm: number; valueMm: number; lane: 0 | 1 }[] = [];
  let prevLane: 0 | 1 = 0;
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    let lane: 0 | 1 = 0;
    if (i > 0) {
      const gapMm = it.centerMm - sorted[i - 1].centerMm;
      if (gapMm < proximityMm) {
        lane = prevLane === 0 ? 1 : 0;
      }
    }
    prevLane = lane;
    out.push({ ...it, lane });
  }
  return out;
}

type Props = {
  bar: BarLayout;
  kerfMm: number;
  displayIndex: number;
  repeat?: number;
};

/** Проверка, поместится ли число длины внутрь сегмента (приближенно, без замеров DOM). */
function canShowPieceValue(lengthMm: number, stockLengthMm: number): boolean {
  if (stockLengthMm <= 0) return false;
  const digits = String(Math.round(lengthMm)).length;
  // Базовый "бюджет" ширины + надбавка на каждую цифру.
  const minFrac = 0.016 + digits * 0.0025;
  return lengthMm / stockLengthMm >= minFrac;
}

function KerfSlot({ kerfMm }: { kerfMm: number }) {
  return (
    <div
      className="relative z-10 flex shrink-0 justify-center overflow-visible bg-muted/70"
      style={{ flex: `${kerfMm} 1 0%`, minWidth: 2 }}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute left-1/2 w-0 -translate-x-1/2 border-l border-dashed border-red-500"
        style={{ top: -10, bottom: -10 }}
      />
    </div>
  );
}

/** Число без «мм» + красная линия со стрелкой к линии реза (правый край выноски = разрез). */
const LEADER_LANE_OFFSET_PX = 22;

function DimensionLeader({
  valueRounded,
  leftPct,
  lane,
}: {
  valueRounded: number;
  leftPct: number;
  lane: 0 | 1;
}) {
  return (
    <div
      className="pointer-events-none absolute flex flex-col items-end"
      style={{
        left: `${leftPct}%`,
        bottom: lane === 0 ? 0 : LEADER_LANE_OFFSET_PX,
        transform: "translateX(-100%)",
        width: "max-content",
        zIndex: lane === 1 ? 2 : 1,
      }}
    >
      <span className="text-foreground mb-0.5 pr-0.5 text-[10px] leading-none font-medium tabular-nums">
        {valueRounded}
      </span>
      <svg
        width="48"
        height="11"
        viewBox="0 0 48 11"
        className="text-red-500"
        aria-hidden
      >
        <line
          x1="0"
          y1="8"
          x2="36"
          y2="8"
          stroke="currentColor"
          strokeWidth="1.1"
        />
        <path d="M36 8 L44 5 L44 11 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function CuttingBarDiagram({
  bar,
  kerfMm,
  displayIndex,
  repeat = 1,
}: Props) {
  const stockLengthMm = bar.stockLengthMm;
  const wasteMm = Math.max(0, bar.wasteMm);

  const rangeLabel =
    repeat > 1
      ? `№ ${displayIndex}–${displayIndex + repeat - 1}`
      : `№ ${displayIndex}`;

  const leadersRaw = cutCenterLeaders(bar, kerfMm);
  const leadersFiltered = filterLeadersByGap(
    leadersRaw,
    stockLengthMm,
    0.045
  );
  const leaders = staggerLeaders(leadersFiltered, stockLengthMm);
  const legendRows = aggregatePiecesForLegend(bar.pieces);

  return (
    <div className="border-border/60 bg-card/30 w-full rounded-md border px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
          {repeat}×
        </Badge>
        <span className="text-foreground font-medium tabular-nums">{rangeLabel}</span>
        <span className="tabular-nums">{stockLengthMm} мм</span>
        <span className="ml-auto tabular-nums">
          ост. {bar.wasteMm.toFixed(0)} мм · занято {bar.usedMm.toFixed(0)} мм
        </span>
      </div>

      <div className={ibmPlex.className}>
        <div className="my-1.5 flex h-9 w-full min-w-0 items-stretch overflow-visible rounded-sm border border-border bg-muted/35 p-px shadow-sm">
          {bar.pieces.map((p, i) => {
          const isFirst = i === 0;
          const isLastPiece = i === bar.pieces.length - 1;
          const showValue = canShowPieceValue(p.lengthMm, stockLengthMm);
          const roundL = isFirst ? "rounded-l-[3px]" : "";
          const roundR =
            isLastPiece && wasteMm <= 0 ? "rounded-r-[3px]" : "";

            return (
              <Fragment key={`${displayIndex}-seg-${i}`}>
              <div
                className={`border-border/80 flex min-h-0 min-w-0 flex-col overflow-hidden border bg-background/40 ${roundL} ${roundR}`}
                style={{ flex: `${p.lengthMm} 1 0%`, minWidth: 2 }}
                title={`${p.label}: ${p.lengthMm} мм`}
              >
                <div
                  className="flex min-h-[32px] flex-1 items-center justify-center px-px text-center"
                  style={{ background: PALETTE[p.colorIndex % PALETTE.length] }}
                >
                  {showValue && (
                    <span className="text-[10px] leading-tight font-medium text-white tabular-nums [text-shadow:0_0_2px_rgba(0,0,0,0.65)]">
                      {p.lengthMm}
                    </span>
                  )}
                </div>
              </div>
              {i < bar.pieces.length - 1 && <KerfSlot kerfMm={kerfMm} />}
              </Fragment>
            );
          })}
          {wasteMm > 0 && bar.pieces.length > 0 && <KerfSlot kerfMm={kerfMm} />}
          {wasteMm > 0 && (
            <div
              className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-r-[3px] border border-dashed border-muted-foreground/30 bg-background/30"
              style={{
                flex: `${wasteMm} 1 0%`,
                minWidth: 2,
                backgroundImage: `repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 4px,
                color-mix(in oklab, var(--foreground) 20%, transparent) 4px,
                color-mix(in oklab, var(--foreground) 20%, transparent) 5px
              )`,
              }}
              title={`Остаток: ${wasteMm.toFixed(0)} мм`}
            />
          )}
        </div>

        {/* Выноски: число, красная линия, стрелка; близкие — на разной высоте */}
        <div
          className="relative mt-0 w-full"
          style={{ minHeight: 42 + LEADER_LANE_OFFSET_PX }}
        >
          {leaders.map((L, idx) => (
            <DimensionLeader
              key={`${displayIndex}-ld-${idx}-${L.centerMm}`}
              valueRounded={Math.round(L.valueMm)}
              leftPct={(L.centerMm / stockLengthMm) * 100}
              lane={L.lane}
            />
          ))}
        </div>
      </div>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        {legendRows.map((row, i) => (
          <li
            key={`${displayIndex}-leg-${row.label}-${row.lengthMm}-${i}`}
            className="flex items-center gap-1.5"
            title={`${row.label}: ${row.lengthMm} мм — ${row.count} шт.`}
          >
            <span
              className="inline-block size-1.5 shrink-0 rounded-sm"
              style={{
                background: PALETTE[row.colorIndex % PALETTE.length],
              }}
            />
            <span className="tabular-nums text-foreground">
              {row.lengthMm} мм × {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
