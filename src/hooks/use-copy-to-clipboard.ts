"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCopyToClipboardResult {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
}

/**
 * Copies text and flips `copied` for `resetDelay` ms so a button can show a
 * transient confirmation.
 */
export function useCopyToClipboard(resetDelay = 2000): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let succeeded = false;

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          succeeded = true;
        } catch {
          succeeded = false;
        }
      }

      // The async Clipboard API is unavailable outside secure contexts (plain
      // http on a LAN IP, which is a normal way to test a WebRTC app).
      if (!succeeded && typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.setAttribute("aria-hidden", "true");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);

        try {
          textarea.select();
          textarea.setSelectionRange(0, text.length);
          succeeded = document.execCommand("copy");
        } catch {
          succeeded = false;
        } finally {
          document.body.removeChild(textarea);
        }
      }

      if (succeeded) {
        setCopied(true);
        if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, resetDelay);
      }

      return succeeded;
    },
    [resetDelay],
  );

  return { copied, copy };
}
