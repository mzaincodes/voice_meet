"use client";

import * as React from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

type Theme = Extract<NonNullable<ToasterProps["theme"]>, "light" | "dark">;

/**
 * next-themes is not a dependency here, so the theme is read straight off the
 * root element's `.dark` class and kept in sync with a MutationObserver.
 */
function useDocumentTheme(): Theme {
  // "system" would make sonner read matchMedia on its first client render while
  // the server rendered the light markup, so start on sonner's own SSR fallback
  // and let the effect below correct it after hydration.
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return theme;
}

function Toaster({ toastOptions, ...props }: ToasterProps) {
  const theme = useDocumentTheme();

  return (
    <SonnerToaster
      theme={theme}
      position="top-center"
      // Clears the sticky room header, which is 64px tall plus its margin.
      offset={76}
      richColors
      closeButton
      className="toaster group"
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:shadow-lg",
          title: "group-[.toast]:font-medium group-[.toast]:text-foreground",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-md group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-md group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:border-border group-[.toast]:bg-card group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground",
          // richColors tints the icon; the surface stays on our card token.
          error: "group-[.toaster]:border-destructive/40!",
          success: "group-[.toaster]:border-success/40!",
          warning: "group-[.toaster]:border-warning/40!",
          info: "group-[.toaster]:border-border!",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
