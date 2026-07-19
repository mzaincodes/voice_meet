"use client";

import { OPUS_SEND_PARAMS } from "@/lib/webrtc-config";
import type { ConnectionQuality } from "@/types";

export interface PeerConnectionOptions {
  peerId: string;
  /**
   * Assigned by the signaling server so exactly one side of every pair offers
   * first. It also decides politeness: the initiator is the *impolite* peer.
   */
  isInitiator: boolean;
  config: RTCConfiguration;
  localStream: MediaStream;
  onDescription: (peerId: string, description: RTCSessionDescriptionInit) => void;
  onCandidate: (peerId: string, candidate: RTCIceCandidateInit) => void;
  onTrack: (peerId: string, stream: MediaStream) => void;
  onQualityChange: (peerId: string, quality: ConnectionQuality) => void;
  onStateChange: (peerId: string, state: RTCPeerConnectionState) => void;
}

const STATS_INTERVAL_MS = 2000;

/** How long a "disconnected" ICE state is tolerated before forcing a restart. */
const DISCONNECTED_GRACE_MS = 3000;

/** ICE restarts are exponentially backed off so a dead path cannot spin. */
const MIN_RESTART_INTERVAL_MS = 2000;

interface QualitySample {
  packetsLost: number;
  packetsReceived: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function classify(lossRatio: number, rttMs: number): ConnectionQuality {
  if (lossRatio < 0.02 && rttMs < 150) return "excellent";
  if (lossRatio < 0.05 && rttMs < 300) return "good";
  if (lossRatio < 0.1 && rttMs < 500) return "fair";
  return "poor";
}

/**
 * Wraps a single `RTCPeerConnection` in a mesh.
 *
 * Negotiation follows the WHATWG "perfect negotiation" pattern so that either
 * side may renegotiate at any time (device switches, ICE restarts) without the
 * two sides ever deadlocking on an offer collision.
 */
export class PeerConnection {
  readonly peerId: string;

  private readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly isInitiator: boolean;
  private readonly options: PeerConnectionOptions;

  /* Perfect-negotiation bookkeeping. */
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;

  private localStream: MediaStream;
  private remoteStream: MediaStream | null = null;

  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSample: QualitySample | null = null;
  private lastRestartAt = 0;
  private quality: ConnectionQuality = "disconnected";
  private closed = false;

  constructor(options: PeerConnectionOptions) {
    this.options = options;
    this.peerId = options.peerId;
    this.isInitiator = options.isInitiator;
    this.polite = !options.isInitiator;
    this.localStream = options.localStream;

    this.pc = new RTCPeerConnection(options.config);

    this.attachHandlers();
    this.addLocalTracks();
    this.startStatsLoop();
  }

  /* ------------------------------------------------------------------ */
  /*                              Wiring                                 */
  /* ------------------------------------------------------------------ */

  private attachHandlers(): void {
    this.pc.onnegotiationneeded = () => {
      void this.negotiate();
    };

    this.pc.onicecandidate = (event) => {
      if (this.closed || !event.candidate) return;
      this.options.onCandidate(this.peerId, event.candidate.toJSON());
    };

    this.pc.ontrack = (event) => {
      if (this.closed) return;
      const stream = event.streams[0] ?? this.ensureRemoteStream(event.track);
      this.remoteStream = stream;
      this.options.onTrack(this.peerId, stream);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const state = this.pc.connectionState;
      this.options.onStateChange(this.peerId, state);
      if (state === "failed" || state === "closed") {
        this.emitQuality("disconnected");
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.closed) return;
      this.handleIceStateChange(this.pc.iceConnectionState);
    };
  }

  private ensureRemoteStream(track: MediaStreamTrack): MediaStream {
    if (this.remoteStream) {
      this.remoteStream.addTrack(track);
      return this.remoteStream;
    }
    return new MediaStream([track]);
  }

  private addLocalTracks(): void {
    for (const track of this.localStream.getAudioTracks()) {
      const sender = this.pc.addTrack(track, this.localStream);
      this.applyOpusParams(sender);
    }
  }

  /**
   * Firefox historically rejects `dtx` and older Safari rejects per-encoding
   * `maxBitrate`; the call is far more valuable than the tuning, so a failure
   * here is intentionally non-fatal.
   */
  private applyOpusParams(sender: RTCRtpSender): void {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      for (const encoding of params.encodings) {
        encoding.maxBitrate = OPUS_SEND_PARAMS.maxBitrate;
      }
      const withDtx = params as RTCRtpSendParameters & { dtx?: "enabled" | "disabled" };
      withDtx.dtx = OPUS_SEND_PARAMS.dtx ? "enabled" : "disabled";

      void sender.setParameters(params).catch(() => undefined);
    } catch {
      /* Tuning is best-effort. */
    }
  }

  /* ------------------------------------------------------------------ */
  /*                       Perfect negotiation                           */
  /* ------------------------------------------------------------------ */

  private async negotiate(): Promise<void> {
    if (this.closed) return;

    try {
      this.makingOffer = true;
      // Parameterless form: the browser picks offer vs. answer based on the
      // current signaling state, which is what makes rollback safe.
      await this.pc.setLocalDescription();
      const description = this.pc.localDescription;
      if (this.closed || !description) return;
      this.options.onDescription(this.peerId, description.toJSON());
    } catch {
      /* A failed negotiation is recovered by the next ICE restart. */
    } finally {
      this.makingOffer = false;
    }
  }

  async handleDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.closed) return;

    const readyForOffer =
      !this.makingOffer &&
      (this.pc.signalingState === "stable" || this.isSettingRemoteAnswerPending);
    const offerCollision = description.type === "offer" && !readyForOffer;

    // Only the impolite peer may drop an incoming offer; the polite peer
    // rolls back instead, which guarantees the collision always resolves.
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    this.isSettingRemoteAnswerPending = description.type === "answer";
    try {
      await this.pc.setRemoteDescription(description);
    } finally {
      this.isSettingRemoteAnswerPending = false;
    }

    if (this.closed || description.type !== "offer") return;

    await this.pc.setLocalDescription();
    const answer = this.pc.localDescription;
    if (this.closed || !answer) return;
    this.options.onDescription(this.peerId, answer.toJSON());
  }

  async handleCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.closed) return;

    try {
      await this.pc.addIceCandidate(candidate);
    } catch (error) {
      // Candidates belonging to an offer we deliberately ignored are expected
      // to fail; anything else is a real signaling fault.
      if (!this.ignoreOffer) throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /*                           Reconnection                              */
  /* ------------------------------------------------------------------ */

  private handleIceStateChange(state: RTCIceConnectionState): void {
    if (state === "connected" || state === "completed") {
      this.clearDisconnectTimer();
      return;
    }

    if (state === "failed") {
      this.clearDisconnectTimer();
      this.restart();
      return;
    }

    if (state === "disconnected") {
      // "disconnected" is frequently transient (a Wi-Fi handover, a brief
      // route change), so give ICE a window to heal itself before forcing a
      // restart that would drop audio for a second or two.
      if (this.disconnectTimer !== null) return;
      this.disconnectTimer = setTimeout(() => {
        this.disconnectTimer = null;
        if (this.closed) return;
        const current = this.pc.iceConnectionState;
        if (current === "disconnected" || current === "failed") {
          this.restart();
        }
      }, DISCONNECTED_GRACE_MS);
      return;
    }

    this.clearDisconnectTimer();
  }

  /**
   * Restarts ICE. Only the initiator does this: if both peers restarted at the
   * same moment they would each generate a fresh offer, and the resulting
   * collision would churn the connection instead of healing it. The responder
   * simply waits for the initiator's new offer.
   */
  restart(): void {
    if (this.closed || !this.isInitiator) return;

    const now = Date.now();
    if (now - this.lastRestartAt < MIN_RESTART_INTERVAL_MS) return;
    this.lastRestartAt = now;

    try {
      this.pc.restartIce();
    } catch {
      /* Nothing more we can do locally; the room will drop the peer. */
    }
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer === null) return;
    clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  /* ------------------------------------------------------------------ */
  /*                         Quality monitoring                          */
  /* ------------------------------------------------------------------ */

  private startStatsLoop(): void {
    this.statsTimer = setInterval(() => {
      void this.sampleQuality();
    }, STATS_INTERVAL_MS);
  }

  private async sampleQuality(): Promise<void> {
    if (this.closed) return;

    const connectionState = this.pc.connectionState;
    if (connectionState === "failed" || connectionState === "closed") {
      this.emitQuality("disconnected");
      return;
    }

    let report: RTCStatsReport;
    try {
      report = await this.pc.getStats();
    } catch {
      return;
    }
    if (this.closed) return;

    // An accumulator object rather than locals: values written inside the
    // `forEach` callback keep their declared type once it returns.
    const acc: {
      packetsLost: number | null;
      packetsReceived: number | null;
      jitterSeconds: number | null;
      nominatedRtt: number | null;
      succeededRtt: number | null;
    } = {
      packetsLost: null,
      packetsReceived: null,
      jitterSeconds: null,
      nominatedRtt: null,
      succeededRtt: null,
    };

    report.forEach((raw: unknown) => {
      const stat = asRecord(raw);
      if (!stat) return;

      const type = readString(stat, "type");

      if (type === "inbound-rtp" && readString(stat, "kind") === "audio") {
        acc.packetsLost = readNumber(stat, "packetsLost") ?? acc.packetsLost;
        acc.packetsReceived = readNumber(stat, "packetsReceived") ?? acc.packetsReceived;
        acc.jitterSeconds = readNumber(stat, "jitter") ?? acc.jitterSeconds;
        return;
      }

      if (type === "candidate-pair") {
        const rtt = readNumber(stat, "currentRoundTripTime");
        if (rtt === null) return;
        if (stat["nominated"] === true) {
          acc.nominatedRtt = rtt;
        } else if (readString(stat, "state") === "succeeded") {
          acc.succeededRtt = rtt;
        }
      }
    });

    const effectiveRtt = acc.nominatedRtt ?? acc.succeededRtt;
    const rttMs = effectiveRtt === null ? 0 : effectiveRtt * 1000;

    // High jitter degrades speech as much as latency does, so it is folded in
    // as an equivalent amount of round-trip time.
    const jitterMs = acc.jitterSeconds === null ? 0 : acc.jitterSeconds * 1000;
    const latencyMs = rttMs + jitterMs * 2;

    let lossRatio = 0;
    const { packetsLost, packetsReceived } = acc;
    if (packetsLost !== null && packetsReceived !== null) {
      const previous = this.lastSample;
      const deltaLost = previous ? packetsLost - previous.packetsLost : packetsLost;
      const deltaReceived = previous
        ? packetsReceived - previous.packetsReceived
        : packetsReceived;
      const expected = deltaLost + deltaReceived;

      this.lastSample = { packetsLost, packetsReceived };

      // A window with no arriving packets says nothing about loss — Opus DTX
      // means silence legitimately produces none — so hold the last verdict.
      if (expected <= 0) return;
      lossRatio = Math.min(Math.max(deltaLost / expected, 0), 1);
    }

    this.emitQuality(classify(lossRatio, latencyMs));
  }

  private emitQuality(next: ConnectionQuality): void {
    if (next === this.quality) return;
    this.quality = next;
    this.options.onQualityChange(this.peerId, next);
  }

  getQuality(): ConnectionQuality {
    return this.quality;
  }

  /* ------------------------------------------------------------------ */
  /*                            Mutation                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Swaps the outgoing microphone without renegotiating — `replaceTrack` keeps
   * the same m-line, so a device switch is inaudible to the remote peer.
   */
  async setLocalStream(stream: MediaStream): Promise<void> {
    if (this.closed) return;

    this.localStream = stream;
    const [track] = stream.getAudioTracks();
    if (!track) return;

    const senders = this.pc.getSenders().filter((s) => s.track?.kind === "audio");

    if (senders.length === 0) {
      const sender = this.pc.addTrack(track, stream);
      this.applyOpusParams(sender);
      return;
    }

    for (const sender of senders) {
      try {
        await sender.replaceTrack(track);
        this.applyOpusParams(sender);
      } catch {
        /* Keep the previous track rather than dropping audio entirely. */
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*                             Teardown                                */
  /* ------------------------------------------------------------------ */

  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.clearDisconnectTimer();

    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.onicegatheringstatechange = null;
    this.pc.onsignalingstatechange = null;
    this.pc.onicecandidateerror = null;
    this.pc.ondatachannel = null;

    for (const sender of this.pc.getSenders()) {
      try {
        void sender.replaceTrack(null);
      } catch {
        /* The connection is going away regardless. */
      }
    }

    try {
      this.pc.close();
    } catch {
      /* Already closed. */
    }

    this.remoteStream = null;
    this.lastSample = null;
  }
}
