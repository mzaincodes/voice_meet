"use client";

import { Loader2, LogIn } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatRoomIdInput,
  isValidName,
  isValidRoomId,
  normalizeRoomId,
  sanitizeName,
} from "@/lib/room";

/** `ABC-DEF-GHJ` — nine characters plus two dashes. */
const ROOM_ID_MAX_LENGTH = 11;

interface JoinRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: (name: string, roomId: string) => void;
  isJoining: boolean;
  initialRoomId?: string;
}

export function JoinRoomDialog({
  open,
  onOpenChange,
  onJoin,
  isJoining,
  initialRoomId = "",
}: JoinRoomDialogProps) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(() => formatRoomIdInput(initialRoomId));
  const [nameTouched, setNameTouched] = useState(false);
  const [roomTouched, setRoomTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setRoomId(formatRoomIdInput(initialRoomId));
    } else {
      setName("");
      setNameTouched(false);
      setRoomTouched(false);
    }
  }, [open, initialRoomId]);

  const nameValid = isValidName(name);
  const roomValid = isValidRoomId(roomId);
  const showNameError = nameTouched && name.length > 0 && !nameValid;
  const showRoomError = roomTouched && roomId.length > 0 && !roomValid;
  const canSubmit = nameValid && roomValid && !isJoining;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameTouched(true);
    setRoomTouched(true);
    if (!canSubmit) return;

    const normalized = normalizeRoomId(roomId);
    if (normalized === null) return;

    onJoin(sanitizeName(name), normalized);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a room</DialogTitle>
          <DialogDescription>
            Enter the room ID someone shared with you, plus the name you want to
            appear as.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-name">Your name</Label>
            <Input
              id="join-name"
              value={name}
              autoFocus
              autoComplete="name"
              maxLength={24}
              placeholder="Ada Lovelace"
              disabled={isJoining}
              aria-invalid={showNameError}
              aria-describedby={showNameError ? "join-name-error" : undefined}
              onBlur={() => setNameTouched(true)}
              onChange={(event) => setName(event.target.value)}
            />
            {showNameError ? (
              <p id="join-name-error" className="text-xs text-destructive">
                Use between 2 and 24 characters.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-room-id">Room ID</Label>
            <Input
              id="join-room-id"
              value={roomId}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={ROOM_ID_MAX_LENGTH}
              placeholder="ABC-DEF-GHJ"
              disabled={isJoining}
              aria-invalid={showRoomError}
              aria-describedby={showRoomError ? "join-room-id-error" : undefined}
              className="font-mono tracking-[0.2em] uppercase"
              onBlur={() => setRoomTouched(true)}
              onChange={(event) =>
                setRoomId(formatRoomIdInput(event.target.value))
              }
            />
            {showRoomError ? (
              <p id="join-room-id-error" className="text-xs text-destructive">
                Room IDs look like ABC-DEF-GHJ.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {isJoining ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Joining&hellip;
                </>
              ) : (
                <>
                  <LogIn aria-hidden="true" />
                  Join room
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
