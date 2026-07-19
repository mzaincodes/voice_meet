"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { containsProfanity } from "@/lib/profanity";

/** Minimum gap between two `onProfanity` calls, and the per-term cooldown. */
const COOLDOWN_MS = 5_000;

const INITIAL_RESTART_DELAY_MS = 300;
const MAX_RESTART_DELAY_MS = 3_000;

interface UseSpeechMonitorOptions {
  enabled: boolean;
  onProfanity: (matches: string[]) => void;
}

export interface SpeechMonitorState {
  isSupported: boolean;
  isListening: boolean;
  error: string | null;
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/**
 * Profanity monitoring on top of the browser-native Web Speech API.
 *
 * The transcript is a privacy liability, so it is consumed inside the result
 * handler and never stored in state, returned, or logged — the only thing that
 * escapes this hook is the list of matched terms.
 */
export function useSpeechMonitor({
  enabled,
  onProfanity,
}: UseSpeechMonitorOptions): SpeechMonitorState {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onProfanityRef = useRef(onProfanity);
  onProfanityRef.current = onProfanity;

  const lastFireRef = useRef(0);
  const recentTermsRef = useRef<Map<string, number>>(new Map());

  const report = useCallback((matches: string[]) => {
    const now = Date.now();
    if (now - lastFireRef.current < COOLDOWN_MS) return;

    const fresh = matches.filter((term) => {
      const seenAt = recentTermsRef.current.get(term);
      return seenAt === undefined || now - seenAt >= COOLDOWN_MS;
    });
    if (fresh.length === 0) return;

    for (const term of fresh) recentTermsRef.current.set(term, now);
    for (const [term, seenAt] of recentTermsRef.current) {
      if (now - seenAt >= COOLDOWN_MS) recentTermsRef.current.delete(term);
    }

    lastFireRef.current = now;
    onProfanityRef.current(fresh);
  }, []);

  useEffect(() => {
    const Recognition = getRecognitionConstructor();
    setIsSupported(Recognition !== null);

    if (!enabled || Recognition === null) {
      setIsListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    let disposed = false;
    /** Set on a permission failure — restarting would only fail again. */
    let fatal = false;
    let restartDelay = INITIAL_RESTART_DELAY_MS;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const start = (): void => {
      if (disposed || fatal) return;
      try {
        recognition.start();
      } catch {
        // Already running (InvalidStateError) — the end handler will retry.
      }
    };

    recognition.onstart = () => {
      if (disposed) return;
      restartDelay = INITIAL_RESTART_DELAY_MS;
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const alternative = event.results[i][0];
        if (!alternative) continue;
        const { found, matches } = containsProfanity(alternative.transcript);
        if (found) report(matches);
      }
    };

    recognition.onerror = (event) => {
      if (disposed) return;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        fatal = true;
        setIsSupported(false);
        setIsListening(false);
        setError("Microphone access for speech monitoring was denied.");
        return;
      }

      // The engine ends itself after silence and on transient network blips;
      // both are expected during a call and must not surface as failures.
      if (event.error === "no-speech" || event.error === "aborted") return;

      setError(event.error);
    };

    recognition.onend = () => {
      if (disposed) return;
      setIsListening(false);
      if (fatal) return;

      restartTimer = setTimeout(start, restartDelay);
      restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS);
    };

    start();

    return () => {
      disposed = true;
      if (restartTimer !== null) clearTimeout(restartTimer);
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      setIsListening(false);
    };
  }, [enabled, report]);

  return { isSupported, isListening, error };
}
