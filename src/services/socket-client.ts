"use client";

import { io, type Socket } from "socket.io-client";

import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@/types";

export type VoiceMeetSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const RAW_SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
const SOCKET_URL = RAW_SOCKET_URL && RAW_SOCKET_URL.length > 0 ? RAW_SOCKET_URL : "http://localhost:3001";

const DEFAULT_ACK_TIMEOUT_MS = 10_000;

export function getSocketUrl(): string {
  return SOCKET_URL;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

/**
 * Pure decision behind {@link getSocketConfigError}, split out so it can be
 * exhaustively tested without a DOM. Returns the reason the given signaling URL
 * cannot work from a page on `pageOrigin`, or null if it looks usable.
 */
export function evaluateSocketConfig(
  socketUrl: string,
  pageProtocol: string,
  pageHostname: string,
): string | null {
  let url: URL;
  try {
    url = new URL(socketUrl);
  } catch {
    return "The signaling server address (NEXT_PUBLIC_SOCKET_URL) is not a valid URL.";
  }

  const pageIsLocal = isLocalHostname(pageHostname);
  const serverIsLocal = isLocalHostname(url.hostname);

  // A deployed page still pointing at localhost — the "works for me only" bug.
  if (!pageIsLocal && serverIsLocal) {
    return "This site is deployed, but its signaling server is still set to localhost, so no one else can connect. Set NEXT_PUBLIC_SOCKET_URL to your deployed signaling server's URL and redeploy.";
  }

  // An HTTPS page cannot open an insecure (ws://) socket to a remote host —
  // the browser blocks it as mixed content before it ever leaves the page.
  if (pageProtocol === "https:" && url.protocol === "http:" && !serverIsLocal) {
    return "This site is served over HTTPS, but the signaling server URL is http://, which browsers block as mixed content. Use an https:// URL for NEXT_PUBLIC_SOCKET_URL.";
  }

  return null;
}

/**
 * Returns a human-readable reason the signaling URL cannot possibly work from
 * the current page, or null if it looks usable.
 *
 * This exists to catch the single most common deploy mistake: shipping the app
 * to a real host without ever pointing `NEXT_PUBLIC_SOCKET_URL` at a deployed
 * signaling server, which leaves every visitor trying to reach *their own*
 * `localhost:3001`. That fails silently and looks exactly like "it works for
 * me but not for anyone else", so we detect it and fail loudly instead.
 */
export function getSocketConfigError(): string | null {
  if (typeof window === "undefined") return null;
  return evaluateSocketConfig(
    SOCKET_URL,
    window.location.protocol,
    window.location.hostname,
  );
}

let socket: VoiceMeetSocket | null = null;

/**
 * Lazily creates the process-wide socket. `autoConnect` is off so callers can
 * finish acquiring the microphone (and therefore know whether joining is even
 * possible) before announcing themselves to the signaling server.
 */
export function getSocket(): VoiceMeetSocket {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  });

  return socket;
}

/** Tears the singleton down completely so the next `getSocket()` starts clean. */
export function disconnectSocket(): void {
  if (!socket) return;

  socket.removeAllListeners();
  socket.io.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/* -------------------------------------------------------------------------- */
/*                              Ack-based emitting                            */
/* -------------------------------------------------------------------------- */

export class SocketAckTimeoutError extends Error {
  readonly event: string;
  readonly timeoutMs: number;

  constructor(event: string, timeoutMs: number) {
    super(`The server did not respond to "${event}" within ${timeoutMs}ms.`);
    this.name = "SocketAckTimeoutError";
    this.event = event;
    this.timeoutMs = timeoutMs;
  }
}

/** Every client event whose signature ends in an `Ack<T>` callback. */
type AckEventName = {
  [K in keyof ClientToServerEvents]: ClientToServerEvents[K] extends (
    payload: infer _P,
    ack: (res: Ack<infer _R>) => void,
  ) => void
    ? K
    : never;
}[keyof ClientToServerEvents];

type AckPayload<K extends AckEventName> = ClientToServerEvents[K] extends (
  payload: infer P,
  ack: (res: Ack<infer _R>) => void,
) => void
  ? P
  : never;

type AckResult<K extends AckEventName> = ClientToServerEvents[K] extends (
  payload: infer _P,
  ack: (res: Ack<infer R>) => void,
) => void
  ? R
  : never;

/**
 * Promise wrapper around the callback-style acks declared in `@/types`.
 *
 * Resolves with the `Ack` union (so `ok: false` stays a normal, typed outcome
 * the caller can map to a friendly message) and rejects only when the server
 * never answers — a case that is otherwise invisible and would hang the UI.
 */
export function emitWithAck<K extends AckEventName>(
  target: VoiceMeetSocket,
  event: K,
  payload: AckPayload<K>,
  timeoutMs: number = DEFAULT_ACK_TIMEOUT_MS,
): Promise<Ack<AckResult<K>>> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new SocketAckTimeoutError(String(event), timeoutMs));
    }, timeoutMs);

    // socket.io's variadic `emit` overload cannot be resolved against an
    // unresolved generic event name; the shape is re-asserted from the
    // contract types above, which remain the source of truth.
    const emit = target.emit.bind(target) as unknown as (
      ev: K,
      arg: AckPayload<K>,
      ack: (res: Ack<AckResult<K>>) => void,
    ) => void;

    emit(event, payload, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    });
  });
}
