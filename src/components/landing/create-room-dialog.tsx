"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Copy, Share2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useWebShare } from "@/hooks/use-web-share";
import { generateRoomId, isValidName, sanitizeName } from "@/lib/room";

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user commits to entering the room they just generated. */
  onEnter: (name: string, roomId: string) => void;
}

/**
 * Two steps: name the participant, then reveal the generated room ID so it can
 * be copied or shared *before* anyone commits to joining. The room itself is
 * only registered with the signaling server once the creator actually enters —
 * which keeps abandoned dialogs from accumulating empty rooms.
 */
export function CreateRoomDialog({ open, onOpenChange, onEnter }: CreateRoomDialogProps) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  const { copied, copy } = useCopyToClipboard();
  const { isSupported: canShare, share } = useWebShare();

  useEffect(() => {
    if (open) return;
    // Reset on close so a cancelled attempt never leaks into the next one.
    setName("");
    setTouched(false);
    setRoomId(null);
    setEntering(false);
  }, [open]);

  const nameValid = isValidName(name);
  const showNameError = touched && name.length > 0 && !nameValid;

  const handleGenerate = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setTouched(true);
      if (!nameValid) return;
      setRoomId(generateRoomId());
    },
    [nameValid],
  );

  const roomUrl = roomId ? `${window.location.origin}/room/${roomId}` : "";

  const handleShare = useCallback(async () => {
    if (!roomId) return;
    const shared = await share({
      title: "Join my VoiceMeet room",
      text: `Join my voice room — the code is ${roomId}.`,
      url: roomUrl,
    });
    // Sharing was dismissed; copying is the sensible fallback.
    if (!shared) await copy(roomUrl);
  }, [roomId, roomUrl, share, copy]);

  const handleEnter = useCallback(() => {
    if (!roomId || !nameValid) return;
    setEntering(true);
    onEnter(sanitizeName(name), roomId);
  }, [roomId, nameValid, name, onEnter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{roomId ? "Your room is ready" : "Create a room"}</DialogTitle>
          <DialogDescription>
            {roomId
              ? "Share this code with up to four other people, then hop in."
              : "Pick the name others will see. We'll generate a room code next."}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {roomId === null ? (
            <motion.form
              key="form"
              onSubmit={handleGenerate}
              className="space-y-4"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="space-y-2">
                <Label htmlFor="create-name">Your name</Label>
                <Input
                  id="create-name"
                  value={name}
                  autoFocus
                  autoComplete="name"
                  maxLength={24}
                  placeholder="Ada Lovelace"
                  aria-invalid={showNameError}
                  aria-describedby={showNameError ? "create-name-error" : undefined}
                  onBlur={() => setTouched(true)}
                  onChange={(event) => setName(event.target.value)}
                />
                {showNameError ? (
                  <p id="create-name-error" className="text-xs text-destructive">
                    Use between 2 and 24 characters.
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={!nameValid} className="w-full">
                  <Sparkles aria-hidden="true" />
                  Generate room
                </Button>
              </DialogFooter>
            </motion.form>
          ) : (
            <motion.div
              key="ready"
              className="space-y-4"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Room code
                </p>
                <p className="mt-1.5 font-mono text-2xl font-semibold tracking-[0.15em]">
                  {roomId}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copy(roomId)}
                  aria-label={copied ? "Room code copied" : "Copy room code"}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? "Copied" : "Copy code"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleShare()}
                  aria-label={canShare ? "Share room link" : "Copy room link"}
                >
                  <Share2 aria-hidden="true" />
                  {canShare ? "Share" : "Copy link"}
                </Button>
              </div>

              {/* Announced politely so screen-reader users hear the copy succeed. */}
              <p aria-live="polite" className="sr-only">
                {copied ? "Copied to clipboard" : ""}
              </p>

              <DialogFooter>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleEnter}
                  disabled={entering}
                >
                  {entering ? "Joining…" : "Join now"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
