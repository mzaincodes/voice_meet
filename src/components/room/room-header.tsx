"use client";

import { Check, Copy, Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MAX_PARTICIPANTS, type SignalingStatus } from "@/types";

interface StatusSpec {
  label: string;
  dot: string;
  text: string;
  pulse: boolean;
}

const STATUS: Record<SignalingStatus, StatusSpec> = {
  idle: { label: "Idle", dot: "bg-muted-foreground", text: "text-muted-foreground", pulse: false },
  connecting: { label: "Connecting", dot: "bg-warning", text: "text-warning", pulse: true },
  connected: { label: "Connected", dot: "bg-success", text: "text-success", pulse: false },
  reconnecting: { label: "Reconnecting", dot: "bg-warning", text: "text-warning", pulse: true },
  disconnected: { label: "Disconnected", dot: "bg-destructive", text: "text-destructive", pulse: false },
  error: { label: "Connection error", dot: "bg-destructive", text: "text-destructive", pulse: false },
};

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        fill="none"
      >
        <rect width="32" height="32" rx="9" fill="var(--primary)" />
        {/* Audio-wave mark: bar heights rise then fall around the centre. */}
        {[
          { x: 8, h: 8 },
          { x: 12.5, h: 14 },
          { x: 17, h: 20 },
          { x: 21.5, h: 11 },
        ].map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={16 - bar.h / 2}
            width="2.5"
            height={bar.h}
            rx="1.25"
            fill="var(--primary-foreground)"
          />
        ))}
      </svg>
      <span className="text-base font-semibold tracking-tight">
        Voice<span className="text-primary">Meet</span>
      </span>
    </div>
  );
}

interface RoomHeaderProps {
  roomId: string;
  participantCount: number;
  status: SignalingStatus;
  onCopy: () => void;
  copied: boolean;
  onShare: () => void;
  canShare: boolean;
}

export function RoomHeader({
  roomId,
  participantCount,
  status,
  onCopy,
  copied,
  onShare,
  canShare,
}: RoomHeaderProps) {
  const statusSpec = STATUS[status];

  return (
    <TooltipProvider delayDuration={200}>
      <header className="panel sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 sm:px-6">
        <Wordmark />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/50 py-1 pr-1 pl-3">
            <span className="sr-only">Room ID</span>
            <span className="font-mono text-sm tracking-wider tabular-nums">
              {roomId}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Copy room ID"
                  onClick={onCopy}
                >
                  {copied ? <Check className="text-success" /> : <Copy />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {copied ? "Copied" : "Copy room ID"}
              </TooltipContent>
            </Tooltip>

            {canShare ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Share room link"
                    onClick={onShare}
                  >
                    <Share2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share room link</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          <span aria-live="polite" className="sr-only">
            {copied ? "Room ID copied to clipboard" : ""}
          </span>

          {/* `aria-label` is prohibited on a plain span, so the accessible name
              comes from real sr-only text alongside the visual shorthand. */}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users aria-hidden="true" className="size-4" />
            <span aria-hidden="true" className="tabular-nums">
              {participantCount}/{MAX_PARTICIPANTS}
            </span>
            <span className="sr-only">
              {participantCount} of {MAX_PARTICIPANTS} participants
            </span>
          </span>

          <span
            role="status"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              statusSpec.text,
            )}
          >
            <span aria-hidden="true" className="relative grid place-items-center">
              {statusSpec.pulse ? (
                <span
                  className={cn(
                    "absolute size-2.5 animate-ping rounded-full opacity-70",
                    statusSpec.dot,
                  )}
                />
              ) : null}
              <span
                className={cn("relative size-2 rounded-full", statusSpec.dot)}
              />
            </span>
            {statusSpec.label}
          </span>
        </div>
      </header>
    </TooltipProvider>
  );
}
