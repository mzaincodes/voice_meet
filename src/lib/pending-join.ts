"use client";

/**
 * Hand-off between the landing page and the room route.
 *
 * The display name deliberately travels through sessionStorage rather than the
 * URL: a room link is meant to be pasted into a group chat, and a name embedded
 * in the query string would be shared along with it.
 */

const KEY = "voicemeet:pending-join";

export interface PendingJoin {
  roomId: string;
  name: string;
  mode: "create" | "join";
}

export function setPendingJoin(pending: PendingJoin): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Storage blocked — the room route falls back to asking for a name.
  }
}

/**
 * Reads and immediately clears the hand-off, so a refresh re-prompts instead of
 * silently rejoining with stale intent (notably: re-`create`ing an existing room).
 */
export function consumePendingJoin(roomId: string): PendingJoin | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("roomId" in parsed) ||
      !("name" in parsed) ||
      !("mode" in parsed)
    ) {
      return null;
    }

    const pending = parsed as PendingJoin;
    if (pending.roomId !== roomId) return null;
    if (pending.mode !== "create" && pending.mode !== "join") return null;
    if (typeof pending.name !== "string") return null;

    window.sessionStorage.removeItem(KEY);
    return pending;
  } catch {
    return null;
  }
}

export function clearPendingJoin(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/** Remembers the last-used display name so returning users don't retype it. */
const NAME_KEY = "voicemeet:name";

export function rememberName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Non-fatal.
  }
}

export function recallName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
