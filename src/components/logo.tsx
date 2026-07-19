import { cn } from "@/lib/utils";

/** Waveform mark — five bars of ascending/descending height inside a rounded square. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="vm-logo-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="oklch(0.26 0.008 265)" />
          <stop offset="100%" stopColor="oklch(0.19 0.006 265)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#vm-logo-grad)" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.35"
      />
      {[
        { x: 7, h: 8 },
        { x: 11.5, h: 14 },
        { x: 16, h: 20 },
        { x: 20.5, h: 14 },
        { x: 25, h: 8 },
      ].map(({ x, h }) => (
        <rect
          key={x}
          x={x - 1.25}
          y={16 - h / 2}
          width="2.5"
          height={h}
          rx="1.25"
          fill="var(--primary)"
          fillOpacity={h > 12 ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}
