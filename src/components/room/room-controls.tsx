"use client";

import { motion } from "framer-motion";
import { Mic, MicOff, PhoneOff, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Wraps a control so hover/tap feedback is consistent across the bar. */
function ControlMotion({ children }: { children: ReactNode }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className="inline-flex"
    >
      {children}
    </motion.div>
  );
}

interface RoomControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
  onOpenSettings: () => void;
  onToggleParticipants: () => void;
  participantCount: number;
  isPanelOpen: boolean;
}

export function RoomControls({
  isMuted,
  onToggleMute,
  onLeave,
  onOpenSettings,
  onToggleParticipants,
  participantCount,
  isPanelOpen,
}: RoomControlsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex justify-center"
      >
        <div
          role="group"
          aria-label="Call controls"
          className={cn(
            "panel-raised flex items-center gap-2 rounded-full px-3 py-2.5 sm:gap-3 sm:px-4",
            "shadow-[0_18px_50px_-12px_var(--shadow-color)]",
          )}
        >
          <ControlMotion>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-lg"
                  variant={isMuted ? "destructive" : "secondary"}
                  // Static label paired with aria-pressed: an action-flipping
                  // label would announce "Unmute…, pressed", which contradicts.
                  aria-label="Mute microphone"
                  aria-pressed={isMuted}
                  onClick={onToggleMute}
                >
                  {isMuted ? <MicOff /> : <Mic />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                <span>{isMuted ? "Unmute" : "Mute"}</span>
                <kbd className="rounded border border-border/60 px-1 font-mono text-[10px]">
                  M
                </kbd>
              </TooltipContent>
            </Tooltip>
          </ControlMotion>

          <ControlMotion>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-lg"
                  variant={isPanelOpen ? "default" : "secondary"}
                  // Static label: with aria-pressed present, a label describing
                  // the *action* would contradict the state being announced.
                  aria-label={`Participants, ${participantCount} in room`}
                  aria-pressed={isPanelOpen}
                  onClick={onToggleParticipants}
                  className="relative"
                >
                  <Users />
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-background"
                  >
                    {participantCount}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPanelOpen ? "Hide participants" : "Show participants"}
              </TooltipContent>
            </Tooltip>
          </ControlMotion>

          <ControlMotion>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="secondary"
                  aria-label="Open audio settings"
                  onClick={onOpenSettings}
                >
                  <Settings />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </ControlMotion>

          <span
            aria-hidden="true"
            className="mx-1 h-8 w-px bg-border/70 sm:mx-2"
          />

          <ControlMotion>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="destructive"
                  aria-label="Leave room"
                  onClick={onLeave}
                >
                  <PhoneOff />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Leave room</TooltipContent>
            </Tooltip>
          </ControlMotion>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
