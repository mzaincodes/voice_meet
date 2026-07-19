"use client";

import { cn } from "@/lib/utils";

/** Per-bar animation offset so the trio ripples instead of pulsing in unison. */
const BAR_DELAYS = ["0ms", "150ms", "300ms"];

interface SpeakingIndicatorProps {
  isSpeaking: boolean;
  level: number;
}

export function SpeakingIndicator({ isSpeaking, level }: SpeakingIndicatorProps) {
  const clamped = Math.min(1, Math.max(0, level));
  // The keyframes own `transform`, so loudness drives height instead —
  // setting an inline transform here would be clobbered by the animation.
  const height = 6 + clamped * 10;

  return (
    <span aria-hidden="true" className="inline-flex h-4 items-center gap-[3px]">
      {BAR_DELAYS.map((delay) => (
        <span
          key={delay}
          className={cn(
            "w-[3px] origin-center rounded-full transition-[height,background-color] duration-150",
            isSpeaking ? "bg-success animate-vm-bar" : "bg-muted-foreground/30",
          )}
          style={{
            height: isSpeaking ? height : 6,
            animationDelay: isSpeaking ? delay : undefined,
          }}
        />
      ))}
    </span>
  );
}
