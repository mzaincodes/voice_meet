"use client";

import { motion } from "framer-motion";
import { ArrowRight, Mic } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recallName } from "@/lib/pending-join";
import { isValidName, sanitizeName } from "@/lib/room";

interface PreJoinProps {
  roomId: string;
  onJoin: (name: string) => void;
}

/**
 * Shown when someone opens a room link directly, so the microphone prompt only
 * appears after they have deliberately chosen to enter.
 */
export function PreJoin({ roomId, onJoin }: PreJoinProps) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setName(recallName());
  }, []);

  const valid = isValidName(name);
  const showError = touched && name.length > 0 && !valid;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (valid) onJoin(sanitizeName(name));
  }

  return (
    <div className="studio-bg flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="panel-raised w-full max-w-sm rounded-2xl p-6 sm:p-7"
      >
        <div className="flex flex-col items-center text-center">
          <Logo className="size-9" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            Join this voice room
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You&rsquo;re about to join
          </p>
          <p className="mt-2 rounded-lg bg-muted/60 px-3 py-1.5 font-mono text-sm font-semibold tracking-[0.12em]">
            {roomId}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prejoin-name">Your name</Label>
            <Input
              id="prejoin-name"
              value={name}
              autoFocus
              autoComplete="name"
              maxLength={24}
              placeholder="Ada Lovelace"
              aria-invalid={showError}
              aria-describedby={showError ? "prejoin-name-error" : undefined}
              onBlur={() => setTouched(true)}
              onChange={(event) => setName(event.target.value)}
            />
            {showError ? (
              <p id="prejoin-name-error" className="text-xs text-destructive">
                Use between 2 and 24 characters.
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={!valid}>
            Join room
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Mic className="size-3.5" aria-hidden="true" />
          Your browser will ask for microphone access
        </p>
      </motion.div>

      <Button asChild variant="ghost" className="mt-4">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
