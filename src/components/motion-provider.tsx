"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The CSS `prefers-reduced-motion` block only reaches keyframe animations.
 * Most motion here is Framer writing inline transforms from JS, which that
 * block cannot touch — `reducedMotion="user"` makes those respect the same
 * OS preference.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
