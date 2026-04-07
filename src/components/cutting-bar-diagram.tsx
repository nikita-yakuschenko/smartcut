"use client";

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import type { BarLayout } from "@/lib/cutting";
import { cumulativePositionsMm, segmentBoundariesMm } from "@/lib/cutting";

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

/** Не показывать подписи кумулята, если по ширине бара они слиплись бы (доля длины заготовки). */
function filterCumulativeLabels(
  values: number[],
  stockLengthMm: number,
  minGapFrac: number
): number[] {
  if (stockLengthMm <= 0 || values.length === 0) return [];
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const out: number[] = [];
  let lastFrac = -Infinity;
  for (const v of sorted) {
    const f = v / stockLengthMm;
    if (out.length === 0 || f - lastFrac >= minGapFrac) {
      out.push(v);
      lastFrac = f;
    }
  }
  const lastVal = sorted[sorted.length - 1];
  if (lastVal != null && out[out.length - 1] !== lastVal) {
    out.push(lastVal);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

type Props = {
  bar: BarLayout;
  kerfMm: number;
  displayIndex: number;
  repeat?: number;
};

export function CuttingBarDiagram({
  bar,
  kerfMm,
  displayIndex,
  repeat = 1,
}: Props) {
  const stockLengthMm = bar.stockLengthMm;
  const boundaries = segmentBoundariesMm(bar, kerfMm);
  const cum = cumulativePositionsMm(bar, kerfMm);
  const wasteMm = Math.max(0, bar.wasteMm);

  const rangeLabel =
    repeat > 1
      ? `№ ${displayIndex}–${displayIndex + repeat - 1}`
      : `№ ${displayIndex}`;

  const cumShown = filterCumulativeLabels(cum, stockLengthMm, 0.045);

  return (
    <div className="border-border/60 bg-card/30 w-full rounded-lg border px-3 py-2">
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

      <div className="relative w-full">
        {/* Линии реза: тонкий красный пунктир, чуть выступают за полосу */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-start"
          style={{ height: 36 }}
          aria-hidden
        >
          {boundaries.map((mm, idx) => (
            <div
              key={`cut-${idx}`}
              className="absolute border-l border-dashed border-red-500"
              style={{
                left: `${(mm / stockLengthMm) * 100}%`,
                top: -3,
                height: 38,
                width: 0,
                borderLeftWidth: 1,
              }}
            />
          ))}
        </div>

        <div className="bg-muted/40 flex h-8 w-full min-w-0 overflow-hidden rounded-lg border border-border shadow-sm">
          {bar.pieces.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === bar.pieces.length - 1 && wasteMm <= 0;
            const isNarrow = p.lengthMm / stockLengthMm < 0.06;
            const roundedL = isFirst ? "rounded-l-lg" : "";
            const roundedR = isLast ? "rounded-r-lg" : "";
            return (
              <Fragment key={`${displayIndex}-seg-${i}`}>
                <div
                  className={`flex min-h-0 min-w-0 items-center justify-center px-0.5 text-center ${roundedL} ${roundedR}`}
                  style={{
                    flex: `${p.lengthMm} 1 0%`,
                    background: PALETTE[p.colorIndex % PALETTE.length],
                    minWidth: 2,
                  }}
                  title={`${p.label}: ${p.lengthMm} мм`}
                >
                  {!isNarrow && (
                    <span className="text-[10px] leading-tight font-medium text-white tabular-nums [text-shadow:0_0_2px_rgba(0,0,0,0.65)]">
                      {p.lengthMm} мм
                    </span>
                  )}
                </div>
                {i < bar.pieces.length - 1 && (
                  <div
                    className="shrink-0 bg-muted/80"
                    style={{
                      flex: `${kerfMm} 1 0%`,
                      minWidth: 2,
                    }}
                    aria-hidden
                  />
                )}
              </Fragment>
            );
          })}
          {wasteMm > 0 && (
            <div
              className="min-h-0 min-w-0 rounded-r-lg"
              style={{
                flex: `${wasteMm} 1 0%`,
                minWidth: 2,
                backgroundColor: "color-mix(in oklab, var(--muted) 85%, transparent)",
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 4px,
                  color-mix(in oklab, var(--foreground) 22%, transparent) 4px,
                  color-mix(in oklab, var(--foreground) 22%, transparent) 5px
                )`,
              }}
              title={`Остаток: ${wasteMm.toFixed(0)} мм`}
            />
          )}
        </div>
      </div>

      {/* Кумулятив: HTML, без растягивания шрифта; разрежение при наложении */}
      <div className="relative mt-1 h-5 w-full">
        {cumShown.map((mm) => (
          <span
            key={`cum-${mm}`}
            className="text-muted-foreground absolute text-[9px] tabular-nums"
            style={{
              left: `${(mm / stockLengthMm) * 100}%`,
              transform: "translateX(-50%)",
              maxWidth: "42%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {mm} мм
          </span>
        ))}
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        {bar.pieces.map((p, i) => (
          <li key={`${displayIndex}-leg-${i}`} className="flex items-center gap-1">
            <span
              className="inline-block size-1.5 shrink-0 rounded-sm"
              style={{
                background: PALETTE[p.colorIndex % PALETTE.length],
              }}
            />
            <span className="text-foreground">{p.label}</span>
            <span className="tabular-nums">{p.lengthMm} мм</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1 text-[10px] leading-tight">
        Красный пунктир — граница реза между деталями (пропил {kerfMm} мм). Штриховка
        — остаток заготовки. Внизу — накопленная длина от начала, мм.
      </p>
    </div>
  );
}
