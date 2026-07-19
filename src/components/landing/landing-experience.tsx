"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CreateRoomDialog } from "@/components/landing/create-room-dialog";
import { Hero } from "@/components/landing/hero";
import { JoinRoomDialog } from "@/components/landing/join-room-dialog";
import { normalizeRoomId } from "@/lib/room";
import { rememberName, setPendingJoin } from "@/lib/pending-join";

type OpenDialog = "none" | "create" | "join";

export function LandingExperience() {
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog>("none");
  const [navigating, setNavigating] = useState(false);
  const [initialRoomId, setInitialRoomId] = useState<string | undefined>(undefined);

  // A `?room=CODE` link opens the join dialog pre-filled — handy for invites
  // that land on the homepage rather than directly on a room URL.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room");
    if (!code) return;
    const normalized = normalizeRoomId(code);
    if (!normalized) return;
    setInitialRoomId(normalized);
    setDialog("join");
  }, []);

  // Warm the room route while the user is still reading the code.
  useEffect(() => {
    router.prefetch("/room/AAA-AAA-AAA");
  }, [router]);

  const enterRoom = useCallback(
    (name: string, roomId: string, mode: "create" | "join") => {
      setNavigating(true);
      rememberName(name);
      setPendingJoin({ roomId, name, mode });
      router.push(`/room/${roomId}`);
    },
    [router],
  );

  return (
    <>
      <Hero onCreate={() => setDialog("create")} onJoin={() => setDialog("join")} />

      <CreateRoomDialog
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : "none")}
        onEnter={(name, roomId) => enterRoom(name, roomId, "create")}
      />

      <JoinRoomDialog
        open={dialog === "join"}
        onOpenChange={(open) => setDialog(open ? "join" : "none")}
        onJoin={(name, roomId) => enterRoom(name, roomId, "join")}
        isJoining={navigating}
        initialRoomId={initialRoomId}
      />
    </>
  );
}
