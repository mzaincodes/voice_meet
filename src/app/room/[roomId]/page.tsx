import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoomExperience } from "@/components/room/room-experience";
import { normalizeRoomId } from "@/lib/room";

interface RoomPageProps {
  params: Promise<{ roomId: string }>;
}

export const metadata: Metadata = {
  title: "Voice room",
  // A room URL is a private invite; keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const normalized = normalizeRoomId(decodeURIComponent(roomId));

  // Reject malformed ids before any client JS loads — a valid id is the only
  // thing worth spinning up a microphone permission prompt for.
  if (!normalized) notFound();

  return <RoomExperience roomId={normalized} />;
}
