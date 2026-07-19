"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Crown, MicOff, VolumeX } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAvatarPalette, getInitials } from "@/lib/room";
import { cn } from "@/lib/utils";
import type { ParticipantView } from "@/types";

type AvatarSize = "sm" | "md" | "lg";

interface SizeSpec {
  box: string;
  text: string;
  badge: string;
  badgeIcon: string;
  /** Ring thickness for the rotating conic accent, in px. */
  ringWidth: number;
}

const SIZES: Record<AvatarSize, SizeSpec> = {
  sm: { box: "size-9", text: "text-xs", badge: "size-4", badgeIcon: "size-2.5", ringWidth: 2 },
  md: { box: "size-14", text: "text-base", badge: "size-5", badgeIcon: "size-3", ringWidth: 2.5 },
  lg: { box: "size-20 sm:size-24", text: "text-2xl", badge: "size-7", badgeIcon: "size-4", ringWidth: 3 },
};

function buildGradient(palette: { from: string; to: string }): string {
  // Two stops from the same family keep white initials legible while still
  // reading as one person's colour.
  return `linear-gradient(150deg, ${palette.from} 0%, ${palette.to} 100%)`;
}

function buildLabel(participant: ParticipantView): string {
  const parts = [participant.name];
  if (participant.isLocal) parts.push("you");
  if (participant.isHost) parts.push("host");
  if (participant.isSpeaking && !participant.isMuted) parts.push("speaking");
  if (participant.isMuted) parts.push("muted");
  if (participant.isLocallyMuted) parts.push("muted for you");
  if (participant.hasWarning) parts.push("flagged for offensive language");
  return parts.join(", ");
}

interface ParticipantAvatarProps {
  participant: ParticipantView;
  size?: AvatarSize;
}

export function ParticipantAvatar({
  participant,
  size = "md",
}: ParticipantAvatarProps) {
  const spec = SIZES[size];
  const palette = getAvatarPalette(participant.name);
  const isActive = participant.isSpeaking && !participant.isMuted;

  const level = Math.min(1, Math.max(0, participant.audioLevel));
  // Activity glows amber — the same indicator colour as the rest of the UI —
  // rather than the person's own colour, so "who is talking" reads instantly.
  const glow = isActive
    ? `0 0 ${12 + level * 30}px ${2 + level * 10}px color-mix(in oklch, var(--primary) ${45 + level * 35}%, transparent)`
    : "0 1px 2px oklch(0 0 0 / 0.25)";

  // A conic gradient painted only on the outer few pixels: the radial mask
  // punches out the middle so the fill reads as a ring, not a disc.
  const conicRingMask = `radial-gradient(farthest-side, transparent calc(100% - ${spec.ringWidth}px), #000 calc(100% - ${spec.ringWidth}px))`;

  return (
    <div className="relative inline-flex shrink-0">
      <AnimatePresence>
        {isActive ? (
          <motion.span
            key="voice-activity"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <span className="absolute inset-0 rounded-full border-2 border-primary/60 animate-vm-ripple" />
            <span
              className="absolute inset-0 rounded-full border-2 border-primary/40 animate-vm-ripple"
              style={{ animationDelay: "0.9s" }}
            />
            <span className="absolute inset-[-3px] rounded-full ring-2 ring-primary/45 animate-vm-pulse-ring" />
            <span
              className="absolute inset-[-5px] rounded-full animate-vm-spin-ring"
              style={{
                backgroundImage:
                  "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklch, var(--primary) 55%, transparent) 90deg, var(--primary) 200deg, transparent 330deg)",
                maskImage: conicRingMask,
                WebkitMaskImage: conicRingMask,
              }}
            />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div
        role="img"
        aria-label={buildLabel(participant)}
        className={cn(
          "relative grid place-items-center rounded-full font-semibold text-white select-none",
          "transition-[box-shadow,filter] duration-150",
          spec.box,
          spec.text,
          participant.isMuted && "grayscale-[0.35]",
        )}
        style={{ backgroundImage: buildGradient(palette), boxShadow: glow }}
      >
        <span aria-hidden="true">{getInitials(participant.name)}</span>
      </div>

      {participant.isHost ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -top-0.5 -right-0.5 z-10 grid place-items-center rounded-full bg-warning text-background shadow-sm ring-2 ring-background",
            spec.badge,
          )}
        >
          <Crown className={spec.badgeIcon} />
        </span>
      ) : null}

      {participant.hasWarning ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className={cn(
                  "absolute -top-0.5 -left-0.5 z-10 grid place-items-center rounded-full bg-warning text-background shadow-sm ring-2 ring-background",
                  spec.badge,
                )}
              >
                <AlertTriangle aria-hidden="true" className={spec.badgeIcon} />
              </span>
            </TooltipTrigger>
            <TooltipContent>Flagged for offensive language</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      {participant.isMuted || participant.isLocallyMuted ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -bottom-0.5 z-10 grid place-items-center rounded-full shadow-sm ring-2 ring-background",
            participant.isLocallyMuted
              ? "bg-muted text-muted-foreground"
              : "bg-destructive text-destructive-foreground",
            spec.badge,
          )}
        >
          {participant.isLocallyMuted ? (
            <VolumeX className={spec.badgeIcon} />
          ) : (
            <MicOff className={spec.badgeIcon} />
          )}
        </span>
      ) : null}
    </div>
  );
}
