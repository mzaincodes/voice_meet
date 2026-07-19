"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Accessible name per thumb, positionally matched to the value array. */
  thumbLabels?: string[];
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  ...props
}: SliderProps) {
  // One Thumb per value; fall back to a single thumb for uncontrolled use.
  const thumbCount = React.useMemo(() => {
    if (Array.isArray(value)) return Math.max(value.length, 1);
    if (Array.isArray(defaultValue)) return Math.max(defaultValue.length, 1);
    return 1;
  }, [value, defaultValue]);

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        "data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-muted",
          "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute bg-primary",
            "data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-slot="slider-thumb"
          // Radix names the thumb, not the Root, so the Root's aria-label is the
          // sensible fallback for the common single-thumb case.
          aria-label={thumbLabels?.[index] ?? props["aria-label"]}
          className={cn(
            "block size-4 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm transition-[box-shadow,transform] outline-none",
            "hover:scale-110",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
