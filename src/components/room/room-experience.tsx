"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MicOff, ServerCrash, Users, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AudioRenderer } from "@/components/room/audio-renderer";
import { LeaveDialog } from "@/components/room/leave-dialog";
import { ParticipantCard } from "@/components/room/participant-card";
import { ParticipantList } from "@/components/room/participant-list";
import { PreJoin } from "@/components/room/pre-join";
import { RoomControls } from "@/components/room/room-controls";
import { RoomFullScreen } from "@/components/room/room-full-screen";
import { RoomHeader } from "@/components/room/room-header";
import { SettingsDialog } from "@/components/room/settings-dialog";
import { useSettings } from "@/contexts/settings-context";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useSpeechMonitor } from "@/hooks/use-speech-monitor";
import { LOCAL_ACTIVITY_KEY, useVoiceActivity } from "@/hooks/use-voice-activity";
import { useWebRTCRoom } from "@/hooks/use-webrtc-room";
import { useWebShare } from "@/hooks/use-web-share";
import { consumePendingJoin, rememberName } from "@/lib/pending-join";
import { cn } from "@/lib/utils";
import { MAX_PARTICIPANTS, type ParticipantView } from "@/types";

/** Column count per participant count, so small calls stay large and centred. */
const GRID_CLASSES: Record<number, string> = {
  1: "grid-cols-1 max-w-xs",
  2: "grid-cols-1 sm:grid-cols-2 max-w-2xl",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl",
  4: "grid-cols-1 sm:grid-cols-2 max-w-3xl",
  5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl",
};

export function RoomExperience({ roomId }: { roomId: string }) {
  const router = useRouter();

  // `null` while we work out whether the landing page handed us a name.
  const [identity, setIdentity] = useState<{ name: string; mode: "create" | "join" } | null>(
    null,
  );
  const [resolvedIdentity, setResolvedIdentity] = useState(false);

  useEffect(() => {
    const pending = consumePendingJoin(roomId);
    if (pending) setIdentity({ name: pending.name, mode: pending.mode });
    setResolvedIdentity(true);
  }, [roomId]);

  const handlePreJoin = useCallback((name: string) => {
    rememberName(name);
    // Arriving via a shared link always means joining an existing room.
    setIdentity({ name, mode: "join" });
  }, []);

  if (!resolvedIdentity) {
    return <div className="studio-bg min-h-dvh" aria-busy="true" />;
  }

  if (!identity) {
    return <PreJoin roomId={roomId} onJoin={handlePreJoin} />;
  }

  return (
    <ActiveRoom
      roomId={roomId}
      userName={identity.name}
      mode={identity.mode}
      onExit={() => router.push("/")}
    />
  );
}

interface ActiveRoomProps {
  roomId: string;
  userName: string;
  mode: "create" | "join";
  onExit: () => void;
}

function ActiveRoom({ roomId, userName, mode, onExit }: ActiveRoomProps) {
  const { settings, updateSettings } = useSettings();

  // A stable identity keeps the hook's audio effect from re-running on every
  // unrelated settings change (e.g. toggling the profanity filter).
  const audioPreferences = useMemo(
    () => ({
      deviceId: settings.inputDeviceId,
      noiseSuppression: settings.noiseSuppression,
      echoCancellation: settings.echoCancellation,
      autoGainControl: settings.autoGainControl,
    }),
    [
      settings.inputDeviceId,
      settings.noiseSuppression,
      settings.echoCancellation,
      settings.autoGainControl,
    ],
  );

  const {
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
  } = useWebRTCRoom({ roomId, userName, mode, audio: audioPreferences });

  const [locallyMuted, setLocallyMuted] = useState<ReadonlySet<string>>(() => new Set());
  const [showLeave, setShowLeave] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const { copied, copy } = useCopyToClipboard();
  const { isSupported: canShare, share } = useWebShare();
  const { devices } = useMediaDevices();

  const isJoined = joinState === "joined";

  const { speaking, levels } = useVoiceActivity(remoteStreams, localStream, isJoined);

  /* --------------------------- profanity monitor --------------------------- */

  const handleProfanity = useCallback(() => {
    toast.warning("Please avoid using abusive or offensive language.", {
      description: "Everyone in the room can hear you. Nobody has been disconnected.",
      duration: 6000,
    });
    reportWarning();
  }, [reportWarning]);

  const { isSupported: speechSupported } = useSpeechMonitor({
    // Monitoring our own microphone is pointless while it is muted.
    enabled: isJoined && settings.profanityFilter && !isMuted,
    onProfanity: handleProfanity,
  });

  /* ----------------------------- notifications ---------------------------- */

  // Announce arrivals and departures, but only after our own join settles, or
  // the initial snapshot would toast once per person already in the room.
  const knownPeersRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!isJoined) {
      knownPeersRef.current = null;
      return;
    }

    const current = new Set(
      participants.filter((p) => p.id !== localPeerId).map((p) => p.id),
    );
    const known = knownPeersRef.current;
    knownPeersRef.current = current;
    if (known === null) return;

    for (const participant of participants) {
      if (participant.id !== localPeerId && !known.has(participant.id)) {
        toast(`${participant.name} joined`);
      }
    }
    for (const id of known) {
      if (!current.has(id)) toast("Someone left the room");
    }
  }, [participants, localPeerId, isJoined]);

  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;
    if (previous === status) return;

    if (status === "reconnecting") {
      toast.loading("Connection lost — reconnecting…", { id: "reconnect" });
    } else if (previous === "reconnecting" && status === "connected") {
      toast.success("Reconnected", { id: "reconnect" });
    }
  }, [status]);

  /* ------------------------------- actions -------------------------------- */

  const roomUrl = typeof window === "undefined" ? "" : `${window.location.origin}/room/${roomId}`;

  const handleCopy = useCallback(() => {
    void copy(roomId).then((ok) => {
      if (ok) toast.success("Room code copied");
    });
  }, [copy, roomId]);

  const handleShare = useCallback(() => {
    void share({
      title: "Join my VoiceMeet room",
      text: `Join my voice room — the code is ${roomId}.`,
      url: roomUrl,
    }).then((shared) => {
      if (!shared) void copy(roomUrl);
    });
  }, [share, copy, roomId, roomUrl]);

  const toggleLocalMute = useCallback((peerId: string) => {
    setLocallyMuted((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }, []);

  const handleLeave = useCallback(() => {
    leave();
    onExit();
  }, [leave, onExit]);

  // Audio settings are applied by the hook watching `audioPreferences`, so the
  // dialog only has to write state — including clearing the device back to null.
  const handleSettingsChange = updateSettings;

  /* --------------------------- keyboard shortcuts -------------------------- */

  useEffect(() => {
    if (!isJoined) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (isTyping) return;

      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isJoined, toggleMute]);

  /* ------------------------------ view model ------------------------------ */

  const views = useMemo<ParticipantView[]>(() => {
    return participants.map((participant) => {
      const isLocal = participant.id === localPeerId;
      const activityKey = isLocal ? LOCAL_ACTIVITY_KEY : participant.id;

      return {
        ...participant,
        isHost: participant.id === hostId,
        isLocal,
        isSpeaking: speaking[activityKey] === true,
        audioLevel: levels[activityKey] ?? 0,
        isLocallyMuted: locallyMuted.has(participant.id),
        quality: isLocal ? "excellent" : (qualities[participant.id] ?? "fair"),
        hasWarning: warnedPeers.has(participant.id),
      };
    });
  }, [participants, localPeerId, hostId, speaking, levels, locallyMuted, qualities, warnedPeers]);

  /* -------------------------------- states -------------------------------- */

  if (joinState === "error") {
    const isFull = error?.includes("full") === true;
    return (
      <RoomFullScreen
        title={isFull ? "This room is full" : "Couldn't join the room"}
        description={error ?? "Something went wrong. Please try again."}
        icon={isFull ? Users : status === "error" ? ServerCrash : WifiOff}
        actionLabel={isFull ? undefined : "Try again"}
        onAction={isFull ? undefined : retry}
        secondaryLabel="Back to home"
        onSecondary={onExit}
      />
    );
  }

  if (!isJoined) {
    return (
      <ConnectingScreen
        stage={joinState === "requesting-media" ? "microphone" : "connecting"}
      />
    );
  }

  const gridClass = GRID_CLASSES[Math.min(views.length, MAX_PARTICIPANTS)] ?? GRID_CLASSES[5];

  return (
    <div className="studio-bg flex min-h-dvh flex-col">
      <RoomHeader
        roomId={roomId}
        participantCount={views.length}
        status={status}
        onCopy={handleCopy}
        copied={copied}
        onShare={handleShare}
        canShare={canShare}
      />

      <main id="main" className="flex flex-1 gap-4 px-4 pb-32 pt-6 sm:px-6">
        <div className="flex flex-1 items-center justify-center">
          <motion.div
            layout
            className={cn("grid w-full gap-4 sm:gap-5", gridClass)}
          >
            <AnimatePresence mode="popLayout">
              {views.map((view) => (
                <ParticipantCard
                  key={view.id}
                  participant={view}
                  onToggleLocalMute={view.isLocal ? undefined : toggleLocalMute}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        <AnimatePresence>
          {showPanel ? (
            <motion.aside
              key="panel"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="hidden w-72 shrink-0 lg:block"
              aria-label="Participants"
            >
              <ParticipantList
                participants={views}
                onToggleLocalMute={toggleLocalMute}
                className="sticky top-24"
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </main>

      {/* On narrow screens the panel becomes a bottom sheet instead of a column. */}
      <AnimatePresence>
        {showPanel ? (
          <motion.button
            key="panel-scrim"
            type="button"
            aria-label="Close participants panel"
            className="fixed inset-0 z-20 bg-foreground/20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPanel(false)}
          />
        ) : null}
        {showPanel ? (
          <motion.div
            key="panel-mobile"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-x-3 bottom-28 z-30 lg:hidden"
          >
            {/* Opaque rather than panel: floating over the avatar grid, a
                translucent sheet let the cards behind it read as broken. */}
            <ParticipantList
              participants={views}
              onToggleLocalMute={toggleLocalMute}
              className="panel-overlay max-h-[45dvh]"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <RoomControls
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onLeave={() => setShowLeave(true)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleParticipants={() => setShowPanel((open) => !open)}
        participantCount={views.length}
        isPanelOpen={showPanel}
      />

      <AudioRenderer streams={remoteStreams} mutedPeers={locallyMuted} />

      <LeaveDialog open={showLeave} onOpenChange={setShowLeave} onConfirm={handleLeave} />

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        devices={devices}
        speechSupported={speechSupported}
      />
    </div>
  );
}

function ConnectingScreen({ stage }: { stage: "microphone" | "connecting" }) {
  // If connecting drags on, hint that a sleeping free-tier server may be the
  // cause — the most common reason a correctly-deployed room is slow to open.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (stage !== "connecting") return;
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [stage]);

  return (
    <div className="studio-bg flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="relative grid size-16 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary/50 animate-vm-ripple" />
        <span className="relative grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <MicOff className="size-7" aria-hidden />
        </span>
      </div>
      <div aria-live="polite">
        <h1 className="text-xl font-semibold tracking-tight">
          {stage === "microphone" ? "Waiting for your microphone" : "Connecting you to the room"}
        </h1>
        <p className="mt-2 max-w-sm text-balance text-sm text-muted-foreground">
          {stage === "microphone"
            ? "Allow microphone access when your browser asks. Nothing is recorded."
            : "Setting up a direct, encrypted connection to everyone in the call."}
        </p>
        {stage === "connecting" && slow ? (
          <p className="mt-3 max-w-sm text-balance text-xs text-muted-foreground/80">
            Taking longer than usual — the signaling server may be waking from
            sleep. This can take up to half a minute on a free plan.
          </p>
        ) : null}
      </div>
    </div>
  );
}
