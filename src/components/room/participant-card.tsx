"use client";

import { motion } from "framer-motion";
import { MicOff, Volume2, VolumeX } from "lucide-react";

import { ConnectionQualityIndicator } from "@/components/room/connection-quality";
import { ParticipantAvatar } from "@/components/room/participant-avatar";
import { SpeakingIndicator } from "@/components/room/speaking-indicator";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ParticipantView } from "@/types";

interface ParticipantCardProps {
  participant: ParticipantView;
  onToggleLocalMute?: (peerId: string) => void;
}

export function ParticipantCard({
  participant,
  onToggleLocalMute,
}: ParticipantCardProps) {
  const isActive = participant.isSpeaking && !participant.isMuted;
  const canLocalMute = !participant.isLocal && onToggleLocalMute !== undefined;

  const localMuteLabel = participant.isLocallyMuted
    ? `Unmute ${participant.name} for me`
    : `Mute ${participant.name} for me`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={cn(
        "group panel relative flex flex-col items-center justify-center gap-3 rounded-2xl p-5 sm:p-6",
        "transition-colors duration-200",
        isActive && "ring-2 ring-primary/50",
      )}
    >
      {canLocalMute ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={localMuteLabel}
                aria-pressed={participant.isLocallyMuted}
                onClick={() => onToggleLocalMute(participant.id)}
                className={cn(
                  "absolute top-2 right-2 size-8 bg-background/60 opacity-0 backdrop-blur-sm",
                  "transition-opacity duration-150",
                  "group-hover:opacity-100 focus-visible:opacity-100",
                  // Never hide the control once it is doing something.
                  participant.isLocallyMuted && "opacity-100",
                )}
              >
                {participant.isLocallyMuted ? (
                  <VolumeX className="text-muted-foreground" />
                ) : (
                  <Volume2 />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{localMuteLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      <ParticipantAvatar participant={participant} size="lg" />

      <div className="flex w-full min-w-0 flex-col items-center gap-1.5">
        <div className="flex w-full min-w-0 items-center justify-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {participant.name}
          </span>
          {participant.isLocal ? (
            <span className="shrink-0 rounded-md bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
              You
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5">
          <ConnectionQualityIndicator quality={participant.quality} />
          <SpeakingIndicator
            isSpeaking={isActive}
            level={participant.audioLevel}
          />
          {participant.isMuted ? (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <MicOff aria-hidden="true" className="size-3.5" />
              <span>Muted</span>
            </span>
          ) : null}
          {participant.isHost ? (
            <span className="text-xs text-muted-foreground">Host</span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
