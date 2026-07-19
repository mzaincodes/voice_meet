"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SeparatorProps = React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
  /** Purely visual separators are hidden from assistive tech. */
  decorative?: boolean;
};

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  const semanticProps = decorative
    ? ({ role: "none" } as const)
    : ({ role: "separator", "aria-orientation": orientation } as const);

  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...semanticProps}
      {...props}
    />
  );
}

export { Separator };
export type { SeparatorProps };
