"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function SiteHeader() {
  const { theme, toggleTheme, mounted } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="panel mx-auto mt-3 flex h-14 w-[min(100%-1.5rem,72rem)] items-center justify-between rounded-2xl px-4 sm:px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight"
          aria-label="VoiceMeet home"
        >
          <Logo className="size-7" />
          <span className="text-[15px]">VoiceMeet</span>
        </Link>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={
              mounted
                ? `Switch to ${theme === "dark" ? "light" : "dark"} theme`
                : "Toggle theme"
            }
          >
            {/* Both icons render; CSS picks one, so there's no hydration mismatch. */}
            <Sun className="size-4 dark:hidden" aria-hidden />
            <Moon className="hidden size-4 dark:block" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
