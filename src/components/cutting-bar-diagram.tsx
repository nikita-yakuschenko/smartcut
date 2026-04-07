"use client";

import { Badge } from "@/components/ui/badge";
import type { BarLayout } from "@/lib/cutting";
import { segmentBoundariesMm } from "@/lib/cutting";

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
  stockLengthMm: number;
  kerfMm: number;
  barIndex: number;
  showMm?: boolean;
};

export function CuttingBarDiagram({
  bar,
  stockLengthMm,
  kerfMm,
  barIndex,
  showMm = true,
}: Props) {
  const W = 100;
  const H = 40;
  const boundaries = segmentBoundariesMm(bar, kerfMm);

  let posMm = 0;
  const rects: React.ReactNode[] = [];
  bar.pieces.forEach((p, i) => {
    const fill = PALETTE[p.colorIndex % PALETTE.length];
    rects.push(
      <rect
        key={`${barIndex}-${i}-${p.demandId}`}
        x={(posMm * W) / stockLengthMm}
        y={8}
        width={(p.lengthMm * W) / stockLengthMm}
        height={24}
        fill={fill}
        stroke="var(--border)"
        strokeWidth={0.35}
        rx={2}
      />
    );
    posMm += p.lengthMm;
    if (i < bar.pieces.length - 1) posMm += kerfMm;
  });

  const cutLines = boundaries.map((posMmLine, idx) => (
    <line
      key={`cut-${idx}`}
      x1={(posMmLine * W) / stockLengthMm}
      y1={4}
      x2={(posMmLine * W) / stockLengthMm}
      y2={H - 4}
      stroke="var(--foreground)"
      strokeWidth={1}
      strokeDasharray="3 2"
      opacity={0.85}
    />
  ));

  return (
    <div className="bg-card/50 w-full space-y-3 rounded-xl border p-4 shadow-sm ring-1 ring-border/50">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            № {barIndex + 1}
          </Badge>
          <span className="font-medium text-foreground">Заготовка</span>
        </div>
        <span className="tabular-nums">
          Остаток {bar.wasteMm.toFixed(0)} мм · занято{" "}
          {bar.usedMm.toFixed(0)} мм
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="bg-muted/20 w-full h-auto rounded-lg border"
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Схема раскроя заготовки ${barIndex + 1}`}
      >
        <rect
          x={0}
          y={6}
          width={W}
          height={28}
          fill="var(--muted)"
          stroke="var(--border)"
          strokeWidth={0.5}
          rx={3}
        />
        {rects}
        {cutLines}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {bar.pieces.map((p, i) => (
          <li key={`${barIndex}-legend-${i}`}>
            <span
              className="mr-1 inline-block size-2 rounded-sm align-middle"
              style={{
                background: PALETTE[p.colorIndex % PALETTE.length],
              }}
            />
            <span className="text-foreground">{p.label}</span>
            {showMm ? (
              <span> — {p.lengthMm} мм</span>
            ) : (
              <span>
                {" "}
                — {(p.lengthMm / 10).toFixed(1).replace(/\.0$/, "")} см
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-[11px] leading-snug">
        Пунктир — границы реза между деталями (пропил {kerfMm} мм).
      </p>
    </div>
  );
}
