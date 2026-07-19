import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server, type Socket } from "socket.io";

import type {
  Ack,
  ClientToServerEvents,
  IcePayload,
  JoinErrorCode,
  Participant,
  RoomSnapshot,
  SdpPayload,
  ServerToClientEvents,
} from "../src/types";

import { generateRoomId, isValidName, normalizeRoomId, sanitizeName } from "./room-id";

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

/** Mirrors `MAX_PARTICIPANTS` in src/types — duplicated because value imports
 *  from src/ would drag the `@/` alias into this standalone process. */
const MAX_PARTICIPANTS = 5;

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const ALLOW_VERCEL_PREVIEWS = process.env.ALLOW_VERCEL_PREVIEWS === "true";

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const VERCEL_PREVIEW_PATTERN = /^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/i;

/** Transport-level backstop; anything larger is dropped before we see it. */
const MAX_HTTP_BUFFER_SIZE = 256 * 1024;
const MAX_SDP_LENGTH = 64 * 1024;
const MAX_CANDIDATE_LENGTH = 1024;
const MAX_SHORT_STRING_LENGTH = 512;

const CREATE_RATE_LIMIT = 10;
const CREATE_RATE_WINDOW_MS = 60_000;
const WARN_RATE_LIMIT = 30;
const WARN_RATE_WINDOW_MS = 60_000;

const SHUTDOWN_GRACE_MS = 5_000;

/**
 * How long an emptied room is kept alive. A client that drops and reconnects
 * re-joins by id; deleting the room the instant the last socket left would turn
 * a two-second network blip into "room not found".
 */
const EMPTY_ROOM_GRACE_MS = 60_000;

/* -------------------------------------------------------------------------- */
/*                                    State                                   */
/* -------------------------------------------------------------------------- */

interface Room {
  id: string;
  hostId: string | null;
  createdAt: number;
  participants: Map<string, Participant>;
  /** socket id -> stable per-tab session id, used to evict reconnect ghosts. */
  sessions: Map<string, string>;
  /** Pending deletion of an empty room; cleared if someone re-joins in time. */
  reapTimer: ReturnType<typeof setTimeout> | null;
}

interface SocketData {
  roomId: string | null;
  sessionId: string | null;
  createTimestamps: number[];
  warnTimestamps: number[];
}

type InterServerEvents = Record<string, never>;

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const rooms = new Map<string, Room>();

function totalParticipants(): number {
  let total = 0;
  for (const room of rooms.values()) total += room.participants.size;
  return total;
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/* -------------------------------------------------------------------------- */
/*                              Runtime validation                            */
/* -------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readShortString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_SHORT_STRING_LENGTH) return null;
  return value;
}

function readNameField(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const raw = readShortString(payload.name);
  if (raw === null || !isValidName(raw)) return null;
  return sanitizeName(raw);
}

function readRoomIdField(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const raw = readShortString(payload.roomId);
  if (raw === null) return null;
  return normalizeRoomId(raw);
}

/**
 * `room:create` may carry a room id the landing page already generated and
 * displayed. `supplied` distinguishes "client didn't send one" (we generate)
 * from "client sent garbage" (we reject).
 */
function readOptionalRoomIdField(payload: unknown): { supplied: boolean; roomId: string | null } {
  if (!isPlainObject(payload)) return { supplied: false, roomId: null };

  const raw = payload.roomId;
  if (raw === undefined || raw === null || raw === "") return { supplied: false, roomId: null };

  const value = readShortString(raw);
  if (value === null) return { supplied: true, roomId: null };
  return { supplied: true, roomId: normalizeRoomId(value) };
}

function readSessionIdField(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  const raw = readShortString(payload.sessionId);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 64 ? trimmed : null;
}

function parseSdpPayload(payload: unknown): SdpPayload | null {
  if (!isPlainObject(payload)) return null;

  const peerId = readShortString(payload.peerId);
  if (peerId === null || peerId.length === 0) return null;

  const description = payload.description;
  if (!isPlainObject(description)) return null;

  const type = description.type;
  if (type !== "offer" && type !== "answer" && type !== "pranswer" && type !== "rollback") {
    return null;
  }

  const sdp = description.sdp;
  if (sdp !== undefined) {
    if (typeof sdp !== "string" || sdp.length > MAX_SDP_LENGTH) return null;
    return { peerId, description: { type, sdp } };
  }

  return { peerId, description: { type } };
}

function parseIcePayload(payload: unknown): IcePayload | null {
  if (!isPlainObject(payload)) return null;

  const peerId = readShortString(payload.peerId);
  if (peerId === null || peerId.length === 0) return null;

  const raw = payload.candidate;
  if (!isPlainObject(raw)) return null;

  const candidate: RTCIceCandidateInit = {};

  if (raw.candidate !== undefined && raw.candidate !== null) {
    if (typeof raw.candidate !== "string" || raw.candidate.length > MAX_CANDIDATE_LENGTH) {
      return null;
    }
    candidate.candidate = raw.candidate;
  }

  if (raw.sdpMid !== undefined) {
    if (raw.sdpMid !== null && (typeof raw.sdpMid !== "string" || raw.sdpMid.length > 64)) {
      return null;
    }
    candidate.sdpMid = raw.sdpMid;
  }

  if (raw.sdpMLineIndex !== undefined) {
    if (
      raw.sdpMLineIndex !== null &&
      (typeof raw.sdpMLineIndex !== "number" ||
        !Number.isInteger(raw.sdpMLineIndex) ||
        raw.sdpMLineIndex < 0 ||
        raw.sdpMLineIndex > 255)
    ) {
      return null;
    }
    candidate.sdpMLineIndex = raw.sdpMLineIndex;
  }

  if (raw.usernameFragment !== undefined) {
    if (
      raw.usernameFragment !== null &&
      (typeof raw.usernameFragment !== "string" || raw.usernameFragment.length > 256)
    ) {
      return null;
    }
    candidate.usernameFragment = raw.usernameFragment;
  }

  return { peerId, candidate };
}

function withinRateLimit(timestamps: number[], limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) timestamps.shift();
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  return true;
}

/* -------------------------------------------------------------------------- */
/*                                    Acks                                    */
/* -------------------------------------------------------------------------- */

const ERROR_MESSAGES: Record<JoinErrorCode, string> = {
  ROOM_NOT_FOUND: "We couldn't find that room. Double-check the code and try again.",
  ROOM_FULL: `That room is full — VoiceMeet rooms hold up to ${MAX_PARTICIPANTS} people.`,
  INVALID_ROOM_ID: "That doesn't look like a valid room code.",
  INVALID_NAME: "Please use a name between 2 and 24 characters.",
  ALREADY_IN_ROOM: "You're already in a room. Leave it before joining another.",
  ROOM_EXISTS: "That room ID is already taken. Try a fresh one.",
  RATE_LIMITED: "You're creating rooms too quickly. Wait a moment and try again.",
  SERVER_ERROR: "Something went wrong on our end. Please try again.",
};

function fail(code: JoinErrorCode): { ok: false; code: JoinErrorCode; message: string } {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

/** Guards against clients that emit without an acknowledgement callback. */
function isAckFn<T>(ack: unknown): ack is (res: Ack<T>) => void {
  return typeof ack === "function";
}

/* -------------------------------------------------------------------------- */
/*                                    Rooms                                   */
/* -------------------------------------------------------------------------- */

/** Deterministic ordering so every client renders the grid identically. */
function orderedParticipants(room: Room): Participant[] {
  return [...room.participants.values()].sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.id.localeCompare(b.id);
  });
}

function snapshot(room: Room): RoomSnapshot {
  return {
    roomId: room.id,
    hostId: room.hostId,
    participants: orderedParticipants(room),
    createdAt: room.createdAt,
  };
}

function cancelReap(room: Room): void {
  if (room.reapTimer === null) return;
  clearTimeout(room.reapTimer);
  room.reapTimer = null;
}

function scheduleReap(room: Room): void {
  cancelReap(room);
  room.reapTimer = setTimeout(() => {
    room.reapTimer = null;
    // Re-check: someone may have joined during the grace window.
    if (room.participants.size > 0) return;
    rooms.delete(room.id);
    log(`room ${room.id} closed (grace period elapsed)`);
  }, EMPTY_ROOM_GRACE_MS);
  room.reapTimer.unref?.();
}

function createUniqueRoomId(): string | null {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = generateRoomId();
    if (!rooms.has(id)) return id;
  }
  return null;
}

/**
 * Removes a stale entry for the same browser tab. Without this, a client whose
 * transport died silently occupies a slot until ping timeout (~45s) while its
 * reconnect — which arrives in well under a second — takes a second slot.
 */
function evictSession(room: Room, sessionId: string | null, exceptSocketId: string): void {
  if (sessionId === null) return;

  for (const [socketId, existing] of room.sessions) {
    if (existing !== sessionId || socketId === exceptSocketId) continue;

    room.sessions.delete(socketId);
    const wasHost = room.hostId === socketId;
    if (room.participants.delete(socketId)) {
      io.to(room.id).emit("participant:left", { peerId: socketId, hostId: room.hostId });
      log(`evicted stale session socket=${socketId} room=${room.id}`);
    }
    // The reconnecting socket inherits the role a moment later in addParticipant.
    if (wasHost) room.hostId = null;
    io.sockets.sockets.get(socketId)?.disconnect(true);
  }
}

function addParticipant(room: Room, socket: AppSocket, name: string, isHost: boolean): Participant {
  const participant: Participant = {
    id: socket.id,
    name,
    isHost,
    isMuted: false,
    joinedAt: Date.now(),
  };
  room.participants.set(socket.id, participant);
  if (socket.data.sessionId !== null) room.sessions.set(socket.id, socket.data.sessionId);
  socket.data.roomId = room.id;
  socket.join(room.id);
  cancelReap(room);
  return participant;
}

/**
 * Single cleanup path shared by `room:leave` and `disconnect`, so a client that
 * drops mid-call is indistinguishable from one that leaves politely.
 */
function leaveRoom(socket: AppSocket, reason: string): void {
  const roomId = socket.data.roomId;
  if (roomId === null) return;

  socket.data.roomId = null;

  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.participants.delete(socket.id)) return;

  room.sessions.delete(socket.id);
  socket.leave(roomId);

  if (room.participants.size === 0) {
    // Cleared so the next arrival is promoted; leaving the departed id here
    // would make the room permanently hostless.
    room.hostId = null;
    // Held briefly rather than deleted, so a reconnect finds the room intact.
    scheduleReap(room);
    log(`room ${roomId} empty — reaping in ${EMPTY_ROOM_GRACE_MS / 1000}s (${reason})`);
    return;
  }

  let hostMigrated = false;
  if (room.hostId === socket.id) {
    const [successor] = orderedParticipants(room);
    successor.isHost = true;
    room.hostId = successor.id;
    hostMigrated = true;
    log(`room ${roomId} host migrated to ${successor.id} (${successor.name})`);
  }

  io.to(roomId).emit("participant:left", { peerId: socket.id, hostId: room.hostId });
  // Host migration rewrites an `isHost` flag the clients already cached, so the
  // authoritative snapshot is pushed rather than left to be inferred.
  if (hostMigrated) io.to(roomId).emit("room:snapshot", snapshot(room));
  log(`leave  room=${roomId} socket=${socket.id} reason=${reason} size=${room.participants.size}`);
}

/**
 * Relaying is only legal between two sockets that currently share a room.
 * Without this check any client could address arbitrary socket ids and inject
 * SDP/ICE into calls it was never part of.
 */
function resolveRelayTarget(socket: AppSocket, targetId: string): string | null {
  const roomId = socket.data.roomId;
  if (roomId === null) return null;
  if (targetId === socket.id) return null;

  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.participants.has(socket.id)) return null;
  if (!room.participants.has(targetId)) return null;

  return targetId;
}

/* -------------------------------------------------------------------------- */
/*                                 HTTP + CORS                                */
/* -------------------------------------------------------------------------- */

function isAllowedOrigin(origin: string | undefined): boolean {
  // Same-origin, curl and platform health probes send no Origin header.
  if (origin === undefined || origin === "") return true;
  if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW_PATTERN.test(origin);
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const httpServer = createServer((req, res) => {
  applyCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && (path === "/health" || path === "/")) {
    const body = JSON.stringify({
      status: "ok",
      rooms: rooms.size,
      participants: totalParticipants(),
      uptime: Math.round(process.uptime()),
    });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "not_found" }));
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  /**
   * The `cors` option only decorates responses — browsers exempt WebSocket
   * upgrades from CORS entirely, so a hostile page could still open a socket
   * and probe rooms. This rejects the handshake itself, which is the only
   * check that actually binds on both transports.
   */
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    const allowed = isAllowedOrigin(typeof origin === "string" ? origin : undefined);
    if (!allowed) log(`rejected handshake from origin ${origin}`);
    callback(null, allowed);
  },
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
  // Tighter than the defaults so a dead transport is reaped in ~25s rather
  // than ~45s, without being so aggressive that a brief stall drops a caller.
  pingInterval: 15_000,
  pingTimeout: 10_000,
});

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                  */
/* -------------------------------------------------------------------------- */

io.on("connection", (socket) => {
  socket.data.roomId = null;
  socket.data.sessionId = null;
  socket.data.createTimestamps = [];
  socket.data.warnTimestamps = [];

  socket.on("room:create", (payload, ack) => {
    if (!isAckFn<RoomSnapshot>(ack)) return;

    if (socket.data.roomId !== null) {
      ack(fail("ALREADY_IN_ROOM"));
      return;
    }

    const name = readNameField(payload);
    if (name === null) {
      ack(fail("INVALID_NAME"));
      return;
    }

    const requested = readOptionalRoomIdField(payload);
    if (requested.supplied && requested.roomId === null) {
      ack(fail("INVALID_ROOM_ID"));
      return;
    }
    // A client-supplied id is never silently swapped — the user may already be
    // looking at it, so a collision is reported and the client regenerates.
    if (requested.roomId !== null && rooms.has(requested.roomId)) {
      ack(fail("ROOM_EXISTS"));
      return;
    }

    // Charged only once the request is well-formed, so a user fumbling their
    // display name keeps getting the actionable error instead of a lockout.
    if (!withinRateLimit(socket.data.createTimestamps, CREATE_RATE_LIMIT, CREATE_RATE_WINDOW_MS)) {
      ack(fail("RATE_LIMITED"));
      log(`rate-limited room:create socket=${socket.id}`);
      return;
    }

    const roomId = requested.roomId ?? createUniqueRoomId();
    if (roomId === null) {
      ack(fail("SERVER_ERROR"));
      return;
    }

    socket.data.sessionId = readSessionIdField(payload);

    const room: Room = {
      id: roomId,
      hostId: socket.id,
      createdAt: Date.now(),
      participants: new Map(),
      sessions: new Map(),
      reapTimer: null,
    };
    rooms.set(roomId, room);
    addParticipant(room, socket, name, true);

    ack({ ok: true, data: snapshot(room) });
    log(`create room=${roomId} host=${socket.id} (${name})`);
  });

  socket.on("room:join", (payload, ack) => {
    if (!isAckFn<RoomSnapshot>(ack)) return;

    if (socket.data.roomId !== null) {
      ack(fail("ALREADY_IN_ROOM"));
      return;
    }

    const roomId = readRoomIdField(payload);
    if (roomId === null) {
      ack(fail("INVALID_ROOM_ID"));
      return;
    }

    const name = readNameField(payload);
    if (name === null) {
      ack(fail("INVALID_NAME"));
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      ack(fail("ROOM_NOT_FOUND"));
      return;
    }

    socket.data.sessionId = readSessionIdField(payload);
    // Before the capacity check: a reconnecting tab must reclaim its own slot
    // rather than be told the room is full by its own ghost.
    evictSession(room, socket.data.sessionId, socket.id);

    if (room.participants.size >= MAX_PARTICIPANTS) {
      ack(fail("ROOM_FULL"));
      return;
    }

    // Captured before the newcomer is added: these are the peers that will offer.
    const existingIds = orderedParticipants(room).map((participant) => participant.id);

    const isHost = room.hostId === null;
    const participant = addParticipant(room, socket, name, isHost);
    if (isHost) room.hostId = socket.id;

    ack({ ok: true, data: snapshot(room) });
    socket.to(roomId).emit("participant:joined", participant);

    // Exactly one offerer per pair: every established peer initiates toward the
    // newcomer and the newcomer initiates toward nobody. This is what keeps the
    // mesh glare-free without any client-side tie-breaking.
    for (const peerId of existingIds) {
      io.to(peerId).emit("peer:initiate", { peerId: socket.id });
    }

    log(`join   room=${roomId} socket=${socket.id} (${name}) size=${room.participants.size}`);
  });

  socket.on("room:check", (payload, ack) => {
    if (!isAckFn<{ roomId: string; count: number; capacity: number }>(ack)) return;

    const roomId = readRoomIdField(payload);
    if (roomId === null) {
      ack(fail("INVALID_ROOM_ID"));
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      ack(fail("ROOM_NOT_FOUND"));
      return;
    }

    ack({
      ok: true,
      data: { roomId: room.id, count: room.participants.size, capacity: MAX_PARTICIPANTS },
    });
  });

  socket.on("room:leave", () => {
    leaveRoom(socket, "left");
  });

  socket.on("participant:mute", (payload) => {
    if (!isPlainObject(payload)) return;
    const isMuted = payload.isMuted;
    if (typeof isMuted !== "boolean") return;

    const roomId = socket.data.roomId;
    if (roomId === null) return;

    const room = rooms.get(roomId);
    const participant = room?.participants.get(socket.id);
    if (!participant) return;

    participant.isMuted = isMuted;
    socket.to(roomId).emit("participant:updated", { peerId: socket.id, isMuted });
  });

  socket.on("participant:warn", () => {
    const roomId = socket.data.roomId;
    if (roomId === null) return;
    if (!withinRateLimit(socket.data.warnTimestamps, WARN_RATE_LIMIT, WARN_RATE_WINDOW_MS)) return;

    const room = rooms.get(roomId);
    if (!room?.participants.has(socket.id)) return;

    socket.to(roomId).emit("participant:warned", { peerId: socket.id });
  });

  socket.on("signal:description", (payload) => {
    const parsed = parseSdpPayload(payload);
    if (parsed === null) return;

    const targetId = resolveRelayTarget(socket, parsed.peerId);
    if (targetId === null) return;

    // peerId is rewritten to the sender so the receiver knows who is talking.
    io.to(targetId).emit("signal:description", {
      peerId: socket.id,
      description: parsed.description,
    });
  });

  socket.on("signal:candidate", (payload) => {
    const parsed = parseIcePayload(payload);
    if (parsed === null) return;

    const targetId = resolveRelayTarget(socket, parsed.peerId);
    if (targetId === null) return;

    io.to(targetId).emit("signal:candidate", {
      peerId: socket.id,
      candidate: parsed.candidate,
    });
  });

  socket.on("disconnect", (reason) => {
    leaveRoom(socket, `disconnect:${reason}`);
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Lifecycle                                 */
/* -------------------------------------------------------------------------- */

httpServer.listen(PORT, () => {
  log(`VoiceMeet signaling server listening on :${PORT}`);
  log(`allowed origins: ${ALLOWED_ORIGINS.join(", ") || "(none)"}`);
  if (ALLOW_VERCEL_PREVIEWS) log("vercel preview origins: allowed");
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} received — shutting down (${rooms.size} rooms, ${totalParticipants()} participants)`);

  io.emit("room:closed", { reason: "The server is restarting. Please rejoin in a moment." });
  for (const room of rooms.values()) cancelReap(room);
  rooms.clear();

  // Hard stop if sockets refuse to drain, so the platform doesn't SIGKILL us mid-flush.
  const forceExit = setTimeout(() => {
    log("forced exit after shutdown grace period");
    process.exit(0);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  io.close(() => {
    httpServer.close(() => {
      log("shutdown complete");
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
