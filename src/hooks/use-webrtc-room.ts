"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeRoomId, sanitizeName } from "@/lib/room";
import {
  AUDIO_CONSTRAINTS,
  buildPeerConfiguration,
  getIceServers,
} from "@/lib/webrtc-config";
import { PeerConnection } from "@/services/peer-connection";
import {
  disconnectSocket,
  emitWithAck,
  getSocket,
  SocketAckTimeoutError,
  type VoiceMeetSocket,
} from "@/services/socket-client";
import type {
  ConnectionQuality,
  JoinErrorCode,
  Participant,
  RoomSnapshot,
  SignalingStatus,
} from "@/types";

export type JoinState = "idle" | "requesting-media" | "connecting" | "joined" | "error";

/** How long a profanity badge stays on an avatar. */
const WARNING_BADGE_MS = 8000;

const SESSION_KEY = "voicemeet:session-id";

/**
 * Stable identifier for this browser tab, surviving socket reconnects (which
 * assign a new socket id). The server uses it to evict our own ghost instead of
 * counting it against the room's capacity.
 */
function getSessionId(): string | undefined {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = globalThis.crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Storage blocked — the server falls back to ping-timeout reaping.
    return undefined;
  }
}

/** The subset of user settings that shapes the outgoing microphone track. */
export interface AudioPreferences {
  /** `null` means "whatever the browser considers the default input". */
  deviceId: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface UseWebRTCRoomOptions {
  roomId: string;
  userName: string;
  mode: "create" | "join";
  audio: AudioPreferences;
}

export interface UseWebRTCRoomResult {
  status: SignalingStatus;
  participants: Participant[];
  localPeerId: string | null;
  hostId: string | null;
  remoteStreams: Map<string, MediaStream>;
  qualities: Record<string, ConnectionQuality>;
  localStream: MediaStream | null;
  isMuted: boolean;
  toggleMute: () => void;
  error: string | null;
  joinState: JoinState;
  leave: () => void;
  retry: () => void;

  /** Peers with an active profanity warning badge. */
  warnedPeers: ReadonlySet<string>;
  /** Flags our own speech as offensive and tells the room. */
  reportWarning: () => void;
}

const JOIN_ERROR_MESSAGES: Record<JoinErrorCode, string> = {
  ROOM_NOT_FOUND: "That room doesn't exist any more. Check the code or start a new call.",
  ROOM_FULL: "This room is full — it can hold up to 5 people.",
  INVALID_ROOM_ID: "That room code doesn't look right. It should look like ABC-DEF-GHJ.",
  INVALID_NAME: "Please enter a display name between 2 and 24 characters.",
  ALREADY_IN_ROOM: "You're already in this room in another tab.",
  ROOM_EXISTS: "That room code is already taken. Try creating the call again.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  SERVER_ERROR: "Something went wrong on our side. Please try again.",
};

function describeMediaError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Microphone access was denied. Allow it in your browser's site settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone found. Connect one and try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your microphone is being used by another app. Close it and try again.";
    case "OverconstrainedError":
      return "That microphone isn't available. Choose a different input device.";
    default:
      return "We couldn't access your microphone. Check your device settings and try again.";
  }
}

function buildAudioConstraints(preferences: AudioPreferences): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    ...AUDIO_CONSTRAINTS,
    noiseSuppression: preferences.noiseSuppression,
    echoCancellation: preferences.echoCancellation,
    autoGainControl: preferences.autoGainControl,
  };
  // `ideal` rather than `exact`: a device that has since been unplugged should
  // fall back to the default mic instead of failing the whole call.
  if (preferences.deviceId) audio.deviceId = { ideal: preferences.deviceId };
  return { audio, video: false };
}

/**
 * Owns the entire call: signaling socket, microphone, and one
 * `PeerConnection` per remote participant (a full mesh, which is only viable
 * because rooms are capped at 5).
 *
 * All mutable machinery lives in refs; React state is written immutably and
 * exists purely so consumers re-render.
 */
export function useWebRTCRoom({
  roomId,
  userName,
  mode,
  audio,
}: UseWebRTCRoomOptions): UseWebRTCRoomResult {
  const [status, setStatus] = useState<SignalingStatus>("idle");
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    () => new Map(),
  );
  const [qualities, setQualities] = useState<Record<string, ConnectionQuality>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Peers whose speech was recently flagged; badges clear themselves. */
  const [warnedPeers, setWarnedPeers] = useState<ReadonlySet<string>>(() => new Set());

  const socketRef = useRef<VoiceMeetSocket | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const configRef = useRef<RTCConfiguration | null>(null);
  const isMutedRef = useRef(false);
  /** The id the server actually gave us; survives reconnects, unlike `mode`. */
  const activeRoomIdRef = useRef<string | null>(null);
  /** Once true, later attempts join rather than create. */
  const hasJoinedRef = useRef(false);
  /** Latest audio preferences, read by the join effect without re-subscribing. */
  const audioRef = useRef(audio);
  audioRef.current = audio;
  /** Preferences the live track was actually built with. */
  const appliedAudioRef = useRef<AudioPreferences | null>(null);
  const warnTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const teardownRef = useRef<(() => void) | null>(null);
  /**
   * StrictMode double-mounts the effect. Every async continuation checks this
   * so work started by a discarded run can never touch the live one.
   */
  const runIdRef = useRef(0);

  /**
   * Shows a warning badge for `peerId` and retracts it after a while. The badge
   * is a nudge, not a punishment — nobody is muted or disconnected for it.
   */
  const flagWarning = useCallback((peerId: string) => {
    setWarnedPeers((prev) => {
      if (prev.has(peerId)) return prev;
      const next = new Set(prev);
      next.add(peerId);
      return next;
    });

    const timers = warnTimersRef.current;
    const existing = timers.get(peerId);
    if (existing !== undefined) clearTimeout(existing);

    timers.set(
      peerId,
      setTimeout(() => {
        timers.delete(peerId);
        setWarnedPeers((prev) => {
          if (!prev.has(peerId)) return prev;
          const next = new Set(prev);
          next.delete(peerId);
          return next;
        });
      }, WARNING_BADGE_MS),
    );
  }, []);

  // Timers outlive the signaling effect, so they get their own teardown.
  useEffect(() => {
    const timers = warnTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isCurrent = () => runIdRef.current === runId;

    const abort = new AbortController();
    const peers = new Map<string, PeerConnection>();
    const pending = new Map<string, RTCIceCandidateInit[]>();
    peersRef.current = peers;
    pendingCandidatesRef.current = pending;

    const cleanName = sanitizeName(userName);
    const normalizedRoomId = normalizeRoomId(roomId);

    // Checked before the mic prompt: asking for a microphone only to reject a
    // malformed code would be a hostile first impression.
    if (mode === "join" && normalizedRoomId === null) {
      setError(JOIN_ERROR_MESSAGES.INVALID_ROOM_ID);
      setJoinState("error");
      setStatus("error");
      return;
    }

    const socket = getSocket();
    socketRef.current = socket;

    /* ---------------------------- peer plumbing --------------------------- */

    const dropPeerState = (peerId: string) => {
      setRemoteStreams((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      setQualities((prev) => {
        if (!(peerId in prev)) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };

    const destroyPeer = (peerId: string) => {
      peers.get(peerId)?.close();
      peers.delete(peerId);
      pending.delete(peerId);
      dropPeerState(peerId);
    };

    const closeAllPeers = () => {
      for (const peer of peers.values()) peer.close();
      peers.clear();
      pending.clear();
      setRemoteStreams((prev) => (prev.size === 0 ? prev : new Map()));
      setQualities((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    };

    const ensurePeer = (peerId: string, isInitiator: boolean): PeerConnection | null => {
      const existing = peers.get(peerId);
      if (existing) return existing;

      const stream = localStreamRef.current;
      const config = configRef.current;
      if (!stream || !config || !isCurrent()) return null;

      const peer = new PeerConnection({
        peerId,
        isInitiator,
        config,
        localStream: stream,
        onDescription: (id, description) => {
          if (!isCurrent()) return;
          socket.emit("signal:description", { peerId: id, description });
        },
        onCandidate: (id, candidate) => {
          if (!isCurrent()) return;
          socket.emit("signal:candidate", { peerId: id, candidate });
        },
        onTrack: (id, remote) => {
          if (!isCurrent()) return;
          setRemoteStreams((prev) => {
            if (prev.get(id) === remote) return prev;
            const next = new Map(prev);
            next.set(id, remote);
            return next;
          });
        },
        onQualityChange: (id, quality) => {
          if (!isCurrent()) return;
          setQualities((prev) => (prev[id] === quality ? prev : { ...prev, [id]: quality }));
        },
        onStateChange: (id, state) => {
          if (!isCurrent()) return;
          if (state !== "failed" && state !== "closed") return;
          setQualities((prev) =>
            prev[id] === "disconnected" ? prev : { ...prev, [id]: "disconnected" },
          );
        },
      });

      peers.set(peerId, peer);
      return peer;
    };

    /* ------------------------------ signaling ----------------------------- */

    const applySnapshot = (snapshot: RoomSnapshot) => {
      activeRoomIdRef.current = snapshot.roomId;
      setParticipants(snapshot.participants);
      setHostId(snapshot.hostId);
    };

    const join = async () => {
      if (!isCurrent()) return;
      setStatus("connecting");

      const targetRoomId = activeRoomIdRef.current ?? normalizedRoomId;

      // Only the very first attempt may create. Once we have been in the room,
      // a reconnect must *join* the room that already exists — and re-creating
      // it would fail with ROOM_EXISTS anyway.
      const shouldCreate = mode === "create" && !hasJoinedRef.current;

      try {
        const sessionId = getSessionId();

        const result = shouldCreate
          ? await emitWithAck(socket, "room:create", {
              name: cleanName,
              sessionId,
              // The landing page already showed this code to the user, so the
              // server must honour it rather than mint its own.
              ...(targetRoomId === null ? {} : { roomId: targetRoomId }),
            })
          : targetRoomId === null
            ? await emitWithAck(socket, "room:create", { name: cleanName, sessionId })
            : await emitWithAck(socket, "room:join", {
                roomId: targetRoomId,
                name: cleanName,
                sessionId,
              });

        if (!isCurrent()) return;

        if (!result.ok) {
          setError(JOIN_ERROR_MESSAGES[result.code] ?? result.message);
          setJoinState("error");
          setStatus("error");
          closeAllPeers();
          socket.disconnect();
          return;
        }

        hasJoinedRef.current = true;
        // The server always registers a fresh participant as unmuted, so a
        // reconnect while muted would otherwise show us live to everyone else.
        if (isMutedRef.current) socket.emit("participant:mute", { isMuted: true });
        applySnapshot(result.data);
        setLocalPeerId(socket.id ?? null);
        setError(null);
        setJoinState("joined");
        setStatus("connected");
      } catch (cause) {
        if (!isCurrent()) return;
        setError(
          cause instanceof SocketAckTimeoutError
            ? "The server isn't responding. Check your connection and try again."
            : "We couldn't join the room. Please try again.",
        );
        setJoinState("error");
        setStatus("error");
      }
    };

    const handleConnect = () => {
      if (!isCurrent()) return;
      setLocalPeerId(socket.id ?? null);
      // Our socket id changed, so every remote peer is now addressing a ghost.
      // The mesh is rebuilt from scratch off the fresh snapshot.
      closeAllPeers();
      void join();
    };

    const handleDisconnect = (reason: string) => {
      if (!isCurrent()) return;
      closeAllPeers();
      setStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    };

    const handleConnectError = () => {
      if (!isCurrent()) return;
      setStatus((prev) => (prev === "connected" ? "reconnecting" : prev));
    };

    const handleSnapshot = (snapshot: RoomSnapshot) => {
      if (!isCurrent()) return;
      applySnapshot(snapshot);
    };

    const handleParticipantJoined = (participant: Participant) => {
      if (!isCurrent()) return;
      setParticipants((prev) =>
        prev.some((p) => p.id === participant.id)
          ? prev.map((p) => (p.id === participant.id ? participant : p))
          : [...prev, participant],
      );
    };

    const handleParticipantLeft = (payload: { peerId: string; hostId: string | null }) => {
      if (!isCurrent()) return;
      destroyPeer(payload.peerId);
      setParticipants((prev) => prev.filter((p) => p.id !== payload.peerId));
      setHostId(payload.hostId);
    };

    const handleParticipantUpdated = (payload: { peerId: string; isMuted: boolean }) => {
      if (!isCurrent()) return;
      setParticipants((prev) =>
        prev.map((p) => (p.id === payload.peerId ? { ...p, isMuted: payload.isMuted } : p)),
      );
    };

    const handleParticipantWarned = (payload: { peerId: string }) => {
      if (!isCurrent()) return;
      flagWarning(payload.peerId);
    };

    const handlePeerInitiate = (payload: { peerId: string }) => {
      if (!isCurrent()) return;
      ensurePeer(payload.peerId, true);
    };

    /**
     * Buffered candidates can only be applied once a remote description exists;
     * `addIceCandidate` before that throws and the candidate is lost, which
     * strands connections that would otherwise have had a viable path.
     */
    const flushCandidates = async (peerId: string, peer: PeerConnection) => {
      const queued = pending.get(peerId);
      if (!queued) return;
      pending.delete(peerId);
      for (const candidate of queued) {
        await peer.handleCandidate(candidate).catch(() => undefined);
      }
    };

    const handleSignalDescription = (payload: {
      peerId: string;
      description: RTCSessionDescriptionInit;
    }) => {
      if (!isCurrent()) return;
      // An offer from a peer we don't know yet means the server nominated them
      // as initiator, so we take the responding (polite) role.
      const peer = ensurePeer(payload.peerId, false);
      if (!peer) return;

      void peer
        .handleDescription(payload.description)
        .then(() => flushCandidates(payload.peerId, peer))
        .catch(() => undefined);
    };

    const handleSignalCandidate = (payload: {
      peerId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (!isCurrent()) return;
      const peer = peers.get(payload.peerId);
      if (!peer) {
        // Candidates can outrun the description that creates the peer.
        const queue = pending.get(payload.peerId) ?? [];
        queue.push(payload.candidate);
        pending.set(payload.peerId, queue);
        return;
      }
      void peer.handleCandidate(payload.candidate).catch(() => undefined);
    };

    const handleRoomClosed = (payload: { reason: string }) => {
      if (!isCurrent()) return;
      closeAllPeers();
      setError(payload.reason || "The call has ended.");
      setJoinState("error");
      setStatus("disconnected");
    };

    /**
     * socket.io only notices a dead transport when a ping times out, which can
     * take tens of seconds. The browser knows immediately, so we mirror its
     * connectivity signal to keep the status indicator honest.
     */
    const handleOffline = () => {
      if (!isCurrent()) return;
      setStatus((prev) => (prev === "disconnected" ? prev : "reconnecting"));
    };

    const handleOnline = () => {
      if (!isCurrent()) return;
      if (socket.connected) {
        // The blip was short enough that the socket never actually dropped, so
        // nothing else will fire to clear the pessimistic "reconnecting" state.
        setStatus("connected");
        return;
      }
      // Nudge socket.io to retry now rather than waiting out its backoff.
      socket.connect();
    };

    const attachListeners = () => {
      window.addEventListener("offline", handleOffline);
      window.addEventListener("online", handleOnline);
      socket.on("connect", handleConnect);
      socket.on("disconnect", handleDisconnect);
      socket.on("connect_error", handleConnectError);
      socket.on("room:snapshot", handleSnapshot);
      socket.on("participant:joined", handleParticipantJoined);
      socket.on("participant:left", handleParticipantLeft);
      socket.on("participant:updated", handleParticipantUpdated);
      socket.on("participant:warned", handleParticipantWarned);
      socket.on("peer:initiate", handlePeerInitiate);
      socket.on("signal:description", handleSignalDescription);
      socket.on("signal:candidate", handleSignalCandidate);
      socket.on("room:closed", handleRoomClosed);
    };

    /* -------------------------------- start ------------------------------- */

    const start = async () => {
      setError(null);
      setJoinState("requesting-media");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(audioRef.current));
      } catch (cause) {
        if (!isCurrent()) return;
        setError(describeMediaError(cause));
        setJoinState("error");
        setStatus("error");
        return;
      }

      if (!isCurrent()) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      for (const track of stream.getAudioTracks()) track.enabled = !isMutedRef.current;
      localStreamRef.current = stream;
      appliedAudioRef.current = audioRef.current;
      setLocalStream(stream);

      const iceServers = await getIceServers(abort.signal);
      if (!isCurrent()) return;
      configRef.current = buildPeerConfiguration(iceServers);

      setJoinState("connecting");
      setStatus("connecting");
      attachListeners();
      socket.connect();
    };

    void start();

    /* ------------------------------ teardown ------------------------------ */

    let torn = false;
    const teardown = () => {
      if (torn) return;
      torn = true;

      abort.abort();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      closeAllPeers();

      if (socket.connected) socket.emit("room:leave");
      disconnectSocket();
      socketRef.current = null;

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      localStreamRef.current = null;
      configRef.current = null;
      activeRoomIdRef.current = null;

      setLocalStream(null);
      setLocalPeerId(null);
      setParticipants([]);
      setHostId(null);
    };

    teardownRef.current = teardown;

    return () => {
      teardownRef.current = null;
      teardown();
    };
    // `flagWarning` is referentially stable, so it never re-runs this effect.
  }, [roomId, userName, mode, attempt, flagWarning]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;

    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getAudioTracks()) track.enabled = !nextMuted;
    }

    setIsMuted(nextMuted);
    socketRef.current?.emit("participant:mute", { isMuted: nextMuted });
  }, []);

  /**
   * Re-acquires the microphone whenever audio preferences change.
   *
   * `applyConstraints` looks like the cheaper path, but Chromium silently
   * no-ops it for the audio-processing flags — it resolves successfully and
   * `getSettings()` still reports the old values. Only a fresh `getUserMedia`
   * actually reconfigures the processing chain. `replaceTrack` then swaps the
   * new track in without renegotiating, so the change is inaudible to peers.
   */
  useEffect(() => {
    const applied = appliedAudioRef.current;
    if (localStreamRef.current === null) return;
    if (
      applied !== null &&
      applied.deviceId === audio.deviceId &&
      applied.noiseSuppression === audio.noiseSuppression &&
      applied.echoCancellation === audio.echoCancellation &&
      applied.autoGainControl === audio.autoGainControl
    ) {
      return;
    }

    let cancelled = false;

    const apply = async () => {
      let next: MediaStream;
      try {
        next = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(audio));
      } catch (cause) {
        if (!cancelled) setError(describeMediaError(cause));
        return;
      }

      if (cancelled) {
        for (const track of next.getTracks()) track.stop();
        return;
      }

      for (const track of next.getAudioTracks()) track.enabled = !isMutedRef.current;

      const previous = localStreamRef.current;
      localStreamRef.current = next;
      appliedAudioRef.current = audio;
      setLocalStream(next);

      await Promise.all(
        Array.from(peersRef.current.values(), (peer) => peer.setLocalStream(next)),
      );

      if (previous && previous !== next) {
        for (const track of previous.getTracks()) track.stop();
      }
    };

    void apply();
    return () => {
      cancelled = true;
    };
  }, [audio, localStream]);

  const leave = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
    setStatus("disconnected");
    setJoinState("idle");
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setStatus("idle");
    setJoinState("idle");
    setAttempt((value) => value + 1);
  }, []);

  /**
   * Tells the room our own speech was flagged, and badges us locally so the
   * warning is visible to the person who triggered it.
   */
  const reportWarning = useCallback(() => {
    const socket = socketRef.current;
    socket?.emit("participant:warn");
    const selfId = socket?.id;
    if (selfId) flagWarning(selfId);
  }, [flagWarning]);

  return useMemo(
    () => ({
      status,
      participants,
      localPeerId,
      hostId,
      remoteStreams,
      qualities,
      localStream,
      isMuted,
      toggleMute,
      error,
      joinState,
      leave,
      retry,
      warnedPeers,
      reportWarning,
    }),
    [
      status,
      participants,
      localPeerId,
      hostId,
      remoteStreams,
      qualities,
      localStream,
      isMuted,
      toggleMute,
      error,
      joinState,
      leave,
      retry,
      warnedPeers,
      reportWarning,
    ],
  );
}
