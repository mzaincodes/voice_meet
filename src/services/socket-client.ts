"use client";

import { io, type Socket } from "socket.io-client";

import type { Ack, ClientToServerEvents, ServerToClientEvents } from "@/types";

export type VoiceMeetSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

const DEFAULT_ACK_TIMEOUT_MS = 10_000;

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
