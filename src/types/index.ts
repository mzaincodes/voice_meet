/**
 * Shared domain + transport types for VoiceMeet.
 *
 * This file is the single source of truth for the client/server contract.
 * It is imported by both the Next.js app and the standalone signaling server,
 * so it must stay free of any runtime/browser-only dependencies.
 */

/** Hard cap on how many people may occupy a single room. */
export const MAX_PARTICIPANTS = 5;

/** Length of a generated room id, excluding the grouping dashes. */
export const ROOM_ID_LENGTH = 9;

/* -------------------------------------------------------------------------- */
/*                                   Domain                                   */
/* -------------------------------------------------------------------------- */

export type ConnectionQuality =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "disconnected";

/** Lifecycle of the socket connection to the signaling server. */
export type SignalingStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

/** Authoritative participant record owned by the signaling server. */
export interface Participant {
  /** Socket id — stable for the lifetime of the connection. */
  id: string;
  name: string;
  isHost: boolean;
  /** Whether this participant has muted their own microphone. */
  isMuted: boolean;
  /** Epoch ms, used for deterministic ordering in the grid. */
  joinedAt: number;
}

/**
 * Client-side view of a participant: the server record enriched with
 * state that only exists locally (speaking, local mute, RTC quality).
 */
export interface ParticipantView extends Participant {
  isLocal: boolean;
  /** Voice activity detection result for this participant. */
  isSpeaking: boolean;
  /** Normalised 0..1 mic energy, drives the ripple intensity. */
  audioLevel: number;
  /** True when *we* have muted this remote participant for ourselves. */
  isLocallyMuted: boolean;
  quality: ConnectionQuality;
  /** Set briefly after profanity is detected in this participant's speech. */
  hasWarning: boolean;
}

/* -------------------------------------------------------------------------- */
/*                             Signaling payloads                             */
/* -------------------------------------------------------------------------- */

export type JoinErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_ROOM_ID"
  | "INVALID_NAME"
  | "ALREADY_IN_ROOM"
  | "ROOM_EXISTS"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

export interface RoomSnapshot {
  roomId: string;
  hostId: string | null;
  participants: Participant[];
  createdAt: number;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; code: JoinErrorCode; message: string };

export interface SdpPayload {
  /** Socket id of the peer this message is addressed to / came from. */
  peerId: string;
  description: RTCSessionDescriptionInit;
}

export interface IcePayload {
  peerId: string;
  candidate: RTCIceCandidateInit;
}

/* -------------------------------------------------------------------------- */
/*                          Socket.IO event signatures                        */
/* -------------------------------------------------------------------------- */

/** Events emitted by the server, listened to on the client. */
export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "participant:joined": (participant: Participant) => void;
  "participant:left": (payload: { peerId: string; hostId: string | null }) => void;
  "participant:updated": (payload: { peerId: string; isMuted: boolean }) => void;
  "participant:warned": (payload: { peerId: string }) => void;
  /**
   * Tells the receiving client to act as the *initiator* toward `peerId`.
   * The server assigns this deterministically so exactly one side offers.
   */
  "peer:initiate": (payload: { peerId: string }) => void;
  "signal:description": (payload: SdpPayload) => void;
  "signal:candidate": (payload: IcePayload) => void;
  "room:closed": (payload: { reason: string }) => void;
}

/** Events emitted by the client, listened to on the server. */
export interface ClientToServerEvents {
  /**
   * `roomId` is optional: the landing page generates one up front so it can be
   * shown and shared before anyone actually joins. The server validates it and
   * falls back to generating its own when omitted.
   *
   * `sessionId` identifies the browser tab across socket reconnects — see
   * `room:join` for why it matters.
   */
  "room:create": (
    payload: { name: string; roomId?: string; sessionId?: string },
    ack: (res: Ack<RoomSnapshot>) => void,
  ) => void;
  /**
   * `sessionId` is a stable per-tab identifier. A socket whose transport dies
   * is not reaped until ping timeout, but the client reconnects in under a
   * second — so without this the server would briefly hold two entries for the
   * same person and could wrongly report the room as full. On join, an existing
   * participant with the same `sessionId` is evicted first.
   */
  "room:join": (
    payload: { roomId: string; name: string; sessionId?: string },
    ack: (res: Ack<RoomSnapshot>) => void,
  ) => void;
  "room:check": (
    payload: { roomId: string },
    ack: (res: Ack<{ roomId: string; count: number; capacity: number }>) => void,
  ) => void;
  "room:leave": () => void;
  "participant:mute": (payload: { isMuted: boolean }) => void;
  "participant:warn": () => void;
  "signal:description": (payload: SdpPayload) => void;
  "signal:candidate": (payload: IcePayload) => void;
}

/* -------------------------------------------------------------------------- */
/*                               UI-only types                                */
/* -------------------------------------------------------------------------- */

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface RoomSettings {
  /** Suppress background noise via the browser's built-in processing. */
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  /** Enable Web Speech API based profanity monitoring. */
  profanityFilter: boolean;
  inputDeviceId: string | null;
}
