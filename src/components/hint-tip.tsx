"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";

type Props = {
  children: React.ReactNode;
  /** Краткая метка для скринридеров */
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
};

/** Иконка «?» с тултипом — паттерн shadcn для подсказок у подписей. */
export function HintTip({
  children,
  label = "Подробнее",
  side = "top",
  className,
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
          className
        )}
        aria-label={label}
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-pretty">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
