"use client";

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

type Props = {
  bar: BarLayout;
  kerfMm: number;
  /** с 1, для подписи «№» */
  displayIndex: number;
  /** одинаковых схем подряд */
  repeat?: number;
};

export function CuttingBarDiagram({
  bar,
  kerfMm,
  displayIndex,
  repeat = 1,
}: Props) {
  const stockLengthMm = bar.stockLengthMm;
  const W = 100;
  const H = 22;
  const boundaries = segmentBoundariesMm(bar, kerfMm);
  const cum = cumulativePositionsMm(bar, kerfMm);

  let posMm = 0;
  const rects: React.ReactNode[] = [];
  bar.pieces.forEach((p, i) => {
    const fill = PALETTE[p.colorIndex % PALETTE.length];
    rects.push(
      <rect
        key={`${displayIndex}-${i}-${p.demandId}`}
        x={(posMm * W) / stockLengthMm}
        y={4}
        width={(p.lengthMm * W) / stockLengthMm}
        height={12}
        fill={fill}
        stroke="var(--border)"
        strokeWidth={0.2}
        rx={1}
      />
    );
    const cx = posMm + p.lengthMm / 2;
    const label = `${p.lengthMm} мм`;
    rects.push(
      <text
        key={`t-${displayIndex}-${i}`}
        x={(cx * W) / stockLengthMm}
        y={12}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: "5px", fontWeight: 600 }}
      >
        {label}
      </text>
    );
    posMm += p.lengthMm;
    if (i < bar.pieces.length - 1) posMm += kerfMm;
  });

  const cutLines = boundaries.map((posMmLine, idx) => (
    <line
      key={`cut-${idx}`}
      x1={(posMmLine * W) / stockLengthMm}
      y1={2}
      x2={(posMmLine * W) / stockLengthMm}
      y2={H - 2}
      stroke="var(--foreground)"
      strokeWidth={0.6}
      strokeDasharray="2 1"
      opacity={0.75}
    />
  ));

  const cumLabels = cum.map((mm, idx) => (
    <text
      key={`cum-${idx}`}
      x={(mm * W) / stockLengthMm}
      y={20}
      textAnchor="middle"
      className="fill-muted-foreground"
      style={{ fontSize: "4.5px" }}
    >
      {mm} мм
    </text>
  ));

  const rangeLabel =
    repeat > 1
      ? `№ ${displayIndex}–${displayIndex + repeat - 1}`
      : `№ ${displayIndex}`;

  return (
    <div className="border-border/60 bg-card/30 w-full rounded-lg border px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="secondary" className="h-5 px-1.5 font-mono text-[10px]">
          {repeat}×
        </Badge>
        <span className="text-foreground font-medium tabular-nums">{rangeLabel}</span>
        <span className="tabular-nums">
          {stockLengthMm} мм
        </span>
        <span className="ml-auto tabular-nums">
          ост. {bar.wasteMm.toFixed(0)} · занято {bar.usedMm.toFixed(0)} мм
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="bg-muted/30 w-full max-h-[72px] rounded border"
        preserveAspectRatio="none"
        aria-label={`Схема раскроя ${rangeLabel}`}
      >
        <rect
          x={0}
          y={2}
          width={W}
          height={16}
          fill="var(--muted)"
          stroke="var(--border)"
          strokeWidth={0.25}
          rx={2}
        />
        {rects}
        {cutLines}
        {cumLabels}
      </svg>
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
        Пунктир — рез между деталями, пропил {kerfMm} мм · внизу на шкале —
        накопленная длина, мм
      </p>
    </div>
  );
}
