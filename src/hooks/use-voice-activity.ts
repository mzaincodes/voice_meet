"use client";

import { useEffect, useRef, useState } from "react";

/** Key used for the local participant inside the returned records. */
export const LOCAL_ACTIVITY_KEY = "local";

const FFT_SIZE = 1024;
const SMOOTHING_TIME_CONSTANT = 0.7;

/** Raw RMS at which someone is considered to have started speaking. */
const ONSET_RMS = 0.045;
/** Lower bar for *staying* speaking — the gap is the hysteresis. */
const RELEASE_RMS = 0.03;
/** How long RMS must stay under the release bar before we drop the flag. */
const HANGOVER_MS = 450;

/** Max state commits per second (10fps) — the loop itself still runs at rAF. */
const COMMIT_INTERVAL_MS = 100;
/** A level must move at least this much to be worth a re-render. */
const LEVEL_EPSILON = 0.05;
/** Speech RMS rarely exceeds ~0.3, so scale it into a usable 0..1 display range. */
const NORMALISE_GAIN = 3.5;

interface AnalyserEntry {
  /** Renegotiation hands us a fresh MediaStream per peer; this spots the swap. */
  streamId: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
  /** Chrome will not pump a remote WebRTC stream into Web Audio without this. */
  keepAlive: HTMLAudioElement;
  speaking: boolean;
  /** Timestamp at which the signal first dropped below the release bar. */
  quietSince: number;
  level: number;
}

export interface VoiceActivityState {
  speaking: Record<string, boolean>;
  levels: Record<string, number>;
}

const EMPTY_STATE: VoiceActivityState = { speaking: {}, levels: {} };

/**
 * Voice activity detection for every stream in the call.
 *
 * One AudioContext and one requestAnimationFrame loop serve all participants;
 * per-stream loops would multiply the frame cost by the participant count.
 */
export function useVoiceActivity(
  streams: Map<string, MediaStream> | null,
  localStream: MediaStream | null,
  enabled: boolean,
): VoiceActivityState {
  const [state, setState] = useState<VoiceActivityState>(EMPTY_STATE);

  const contextRef = useRef<AudioContext | null>(null);
  const entriesRef = useRef<Map<string, AnalyserEntry>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastCommitRef = useRef(0);
  const committedRef = useRef<VoiceActivityState>(EMPTY_STATE);
  const gestureCleanupRef = useRef<(() => void) | null>(null);

  // Refs let the effect read the freshest streams without re-subscribing on
  // every parent render; the signature below decides when work is actually due.
  const combined = new Map<string, MediaStream>();
  if (localStream) combined.set(LOCAL_ACTIVITY_KEY, localStream);
  if (streams) {
    for (const [id, stream] of streams) combined.set(id, stream);
  }
  const combinedRef = useRef(combined);
  combinedRef.current = combined;

  const signature = Array.from(combined, ([id, stream]) => `${id}:${stream.id}`)
    .sort()
    .join("|");

  useEffect(() => {
    const entries = entriesRef.current;

    function teardownEntry(entry: AnalyserEntry): void {
      entry.source.disconnect();
      entry.analyser.disconnect();
      entry.keepAlive.pause();
      entry.keepAlive.srcObject = null;
    }

    if (!enabled) {
      for (const entry of entries.values()) teardownEntry(entry);
      entries.clear();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (committedRef.current !== EMPTY_STATE) {
        committedRef.current = EMPTY_STATE;
        setState(EMPTY_STATE);
      }
      return;
    }

    let context = contextRef.current;
    if (!context || context.state === "closed") {
      context = new AudioContext();
      contextRef.current = context;
    }
    const audioContext = context;

    // Autoplay policy suspends a context created outside a user gesture, and a
    // suspended context reports silence forever. Resume on the next interaction.
    if (audioContext.state === "suspended" && !gestureCleanupRef.current) {
      const resume = (): void => {
        void audioContext.resume().catch(() => undefined);
        gestureCleanupRef.current?.();
        gestureCleanupRef.current = null;
      };
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
      window.addEventListener("touchstart", resume);
      gestureCleanupRef.current = () => {
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
        window.removeEventListener("touchstart", resume);
      };
    }

    const desired = combinedRef.current;

    for (const [id, entry] of entries) {
      if (!desired.has(id)) {
        teardownEntry(entry);
        entries.delete(id);
      }
    }

    for (const [id, stream] of desired) {
      const existing = entries.get(id);
      if (existing) {
        if (existing.streamId === stream.id) continue;
        // Same peer, different stream (ICE restart / renegotiation): the old
        // nodes are wired to a dead source and would report silence forever.
        teardownEntry(existing);
        entries.delete(id);
      }
      if (stream.getAudioTracks().length === 0) continue;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const keepAlive = new Audio();
      keepAlive.srcObject = stream;
      keepAlive.muted = true;
      void keepAlive.play().catch(() => undefined);

      entries.set(id, {
        streamId: stream.id,
        source,
        analyser,
        buffer: new Uint8Array(analyser.fftSize),
        keepAlive,
        speaking: false,
        quietSince: 0,
        level: 0,
      });
    }

    if (rafRef.current !== null) return;

    const tick = (): void => {
      rafRef.current = requestAnimationFrame(tick);

      const now = performance.now();

      for (const entry of entries.values()) {
        entry.analyser.getByteTimeDomainData(entry.buffer);

        let sumSquares = 0;
        for (let i = 0; i < entry.buffer.length; i += 1) {
          const centred = (entry.buffer[i] - 128) / 128;
          sumSquares += centred * centred;
        }
        const rms = Math.sqrt(sumSquares / entry.buffer.length);
        entry.level = Math.min(1, rms * NORMALISE_GAIN);

        if (!entry.speaking) {
          if (rms >= ONSET_RMS) {
            entry.speaking = true;
            entry.quietSince = 0;
          }
        } else if (rms > RELEASE_RMS) {
          entry.quietSince = 0;
        } else if (entry.quietSince === 0) {
          entry.quietSince = now;
        } else if (now - entry.quietSince >= HANGOVER_MS) {
          entry.speaking = false;
          entry.quietSince = 0;
        }
      }

      if (now - lastCommitRef.current < COMMIT_INTERVAL_MS) return;

      // Compared against the last *committed* state rather than a per-tick flag,
      // so a transition that lands inside the throttle window still gets sent.
      const previous = committedRef.current;
      let shouldCommit = Object.keys(previous.levels).length !== entries.size;

      if (!shouldCommit) {
        for (const [id, entry] of entries) {
          if (entry.speaking !== (previous.speaking[id] ?? false)) {
            shouldCommit = true;
            break;
          }
          if (Math.abs(entry.level - (previous.levels[id] ?? 0)) > LEVEL_EPSILON) {
            shouldCommit = true;
            break;
          }
        }
      }

      if (!shouldCommit) return;

      const speaking: Record<string, boolean> = {};
      const levels: Record<string, number> = {};
      for (const [id, entry] of entries) {
        speaking[id] = entry.speaking;
        levels[id] = entry.level;
      }

      lastCommitRef.current = now;
      committedRef.current = { speaking, levels };
      setState(committedRef.current);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [enabled, signature]);

  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      for (const entry of entries.values()) {
        entry.source.disconnect();
        entry.analyser.disconnect();
        entry.keepAlive.pause();
        entry.keepAlive.srcObject = null;
      }
      entries.clear();

      gestureCleanupRef.current?.();
      gestureCleanupRef.current = null;

      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  return state;
}
