"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "voicemeet:theme";

export type Theme = "light" | "dark";

/**
 * Reads/writes the theme applied by `ThemeScript`. Kept deliberately tiny —
 * the class is already on <html> before hydration, so this only has to mirror it.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the theme still applies for this session.
    }
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}
