"use client";

import { SignalZero } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectionQuality } from "@/types";

interface QualityTier {
  bars: number;
  label: string;
  /** Tailwind class applied to the filled bars. */
  fill: string;
}

const TIERS: Record<ConnectionQuality, QualityTier> = {
  excellent: { bars: 4, label: "Excellent connection", fill: "bg-success" },
  good: { bars: 3, label: "Good connection", fill: "bg-success" },
  fair: { bars: 2, label: "Fair connection", fill: "bg-warning" },
  poor: { bars: 1, label: "Poor connection", fill: "bg-destructive" },
  disconnected: { bars: 0, label: "Disconnected", fill: "bg-muted-foreground" },
};

/** Ascending bar heights, in px, so the group reads as a signal meter. */
const BAR_HEIGHTS = [4, 7, 10, 13];

interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
  showLabel?: boolean;
}

export function ConnectionQualityIndicator({
  quality,
  showLabel = false,
}: ConnectionQualityIndicatorProps) {
  const tier = TIERS[quality];
  const isDisconnected = quality === "disconnected";

  const meter = (
    <span
      role="img"
      aria-label={tier.label}
      className="inline-flex items-end gap-[2px]"
    >
      {isDisconnected ? (
        <SignalZero
          aria-hidden="true"
          className="size-3.5 text-muted-foreground"
        />
      ) : (
        BAR_HEIGHTS.map((height, index) => (
          <span
            key={height}
            aria-hidden="true"
            className={cn(
              "w-[3px] rounded-full transition-colors duration-200",
              index < tier.bars ? tier.fill : "bg-muted-foreground/25",
            )}
            style={{ height }}
          />
        ))
      )}
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex items-center gap-1.5">
            {meter}
            {showLabel ? (
              <span className="text-xs text-muted-foreground">
                {tier.label}
              </span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tier.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
