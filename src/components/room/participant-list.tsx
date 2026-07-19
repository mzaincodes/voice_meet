"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, MicOff, UserPlus, Users, Volume2, VolumeX } from "lucide-react";

import { ConnectionQualityIndicator } from "@/components/room/connection-quality";
import { ParticipantAvatar } from "@/components/room/participant-avatar";
import { SpeakingIndicator } from "@/components/room/speaking-indicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MAX_PARTICIPANTS, type ParticipantView } from "@/types";

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div aria-hidden="true" className="relative grid place-items-center">
        <span className="absolute size-20 rounded-full bg-primary/10" />
        <span className="absolute size-14 rounded-full bg-primary/15" />
        <Users className="relative size-8 text-primary/70" />
        <UserPlus className="absolute -right-1 -bottom-1 size-5 rounded-full bg-background p-0.5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Waiting for others to join&hellip;</p>
      <p className="max-w-[22ch] text-xs text-muted-foreground">
        Share the room ID and up to {MAX_PARTICIPANTS - 1} more people can hop
        in.
      </p>
    </div>
  );
}

interface ParticipantListProps {
  participants: ParticipantView[];
  onToggleLocalMute: (peerId: string) => void;
  className?: string;
}

export function ParticipantList({
  participants,
  onToggleLocalMute,
  className,
}: ParticipantListProps) {
  const isAlone = participants.length <= 1;

  return (
    <aside
      aria-label="Participants"
      className={cn("panel flex min-h-0 flex-col overflow-hidden rounded-2xl", className)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Participants</h2>
        <Badge variant="secondary" className="font-mono text-xs">
          {participants.length}/{MAX_PARTICIPANTS}
        </Badge>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        {isAlone ? <EmptyState /> : null}

        <ul role="list" className="flex flex-col gap-1 p-2">
          <AnimatePresence initial={false}>
            {participants.map((participant) => {
              const isActive =
                participant.isSpeaking && !participant.isMuted;
              const localMuteLabel = participant.isLocallyMuted
                ? `Unmute ${participant.name} for me`
                : `Mute ${participant.name} for me`;

              return (
                <motion.li
                  key={participant.id}
                  layout
                  role="listitem"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ type: "spring", stiffness: 340, damping: 30 }}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-2 py-2",
                    "transition-colors duration-150 hover:bg-accent/50",
                    isActive && "bg-primary/8",
                  )}
                >
                  <ParticipantAvatar participant={participant} size="sm" />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {participant.name}
                      </span>
                      {participant.isLocal ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          (You)
                        </span>
                      ) : null}
                      {participant.isHost ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 gap-1 px-1.5 py-0 text-[10px]"
                        >
                          <Crown aria-hidden="true" className="size-2.5" />
                          Host
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <ConnectionQualityIndicator
                        quality={participant.quality}
                      />
                      <SpeakingIndicator
                        isSpeaking={isActive}
                        level={participant.audioLevel}
                      />
                      {participant.isMuted ? (
                        <MicOff
                          aria-label={`${participant.name} is muted`}
                          role="img"
                          className="size-3.5 text-destructive"
                        />
                      ) : null}
                    </div>
                  </div>

                  {participant.isLocal ? null : (
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
                              "size-8 shrink-0 opacity-0 transition-opacity duration-150",
                              "group-hover:opacity-100 focus-visible:opacity-100",
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
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </aside>
  );
}
