import type { JoinErrorCode } from "@/types";

/** Human-facing copy for every failure the signaling server can report. */
const JOIN_ERROR_COPY: Record<JoinErrorCode, { title: string; description: string }> = {
  ROOM_NOT_FOUND: {
    title: "Room not found",
    description:
      "That room ID doesn't match an active room. Rooms close automatically once everyone leaves.",
  },
  ROOM_FULL: {
    title: "Room is full",
    description:
      "This room already has 5 participants, which is the maximum. Ask the host to start another one.",
  },
  INVALID_ROOM_ID: {
    title: "Invalid room ID",
    description: "Room IDs look like ABC-DEF-GHJ. Double-check the code and try again.",
  },
  INVALID_NAME: {
    title: "Name needs work",
    description: "Please enter a display name between 2 and 24 characters.",
  },
  ALREADY_IN_ROOM: {
    title: "Already connected",
    description: "You're already in this room in another tab.",
  },
  ROOM_EXISTS: {
    title: "Room ID taken",
    description: "That room already exists. Generating a fresh one…",
  },
  RATE_LIMITED: {
    title: "Slow down",
    description: "You're creating rooms too quickly. Wait a moment and try again.",
  },
  SERVER_ERROR: {
    title: "Something went wrong",
    description: "The signaling server hit an unexpected error. Please try again.",
  },
};

export function describeJoinError(code: JoinErrorCode) {
  return JOIN_ERROR_COPY[code] ?? JOIN_ERROR_COPY.SERVER_ERROR;
}

/** Maps a getUserMedia rejection onto copy a non-technical user can act on. */
export function describeMediaError(error: unknown): { title: string; description: string } {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "Microphone access blocked",
        description:
          "VoiceMeet needs your microphone to join a call. Allow access in your browser's site settings, then try again.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        title: "No microphone found",
        description: "Connect a microphone or headset and try again.",
      };
    case "NotReadableError":
    case "AbortError":
      return {
        title: "Microphone unavailable",
        description:
          "Another app is using your microphone. Close it and try again.",
      };
    default:
      return {
        title: "Couldn't start audio",
        description:
          "We couldn't access your microphone. Check your browser permissions and try again.",
      };
  }
}

export class TimeoutError extends Error {
  constructor(message = "The request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}
