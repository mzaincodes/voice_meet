"use client";

import { useCallback, useEffect, useState } from "react";

export interface WebSharePayload {
  title: string;
  text: string;
  url: string;
}

export interface UseWebShareResult {
  isSupported: boolean;
  share: (payload: WebSharePayload) => Promise<boolean>;
}

/** Native share sheet, with a caller-friendly boolean instead of throwing. */
export function useWebShare(): UseWebShareResult {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const share = useCallback(async (payload: WebSharePayload): Promise<boolean> => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return false;
    }

    try {
      await navigator.share(payload);
      return true;
    } catch {
      // Dismissing the share sheet rejects with AbortError, so a rejection here
      // means "not shared" rather than "something broke" — never surface it.
      return false;
    }
  }, []);

  return { isSupported, share };
}
