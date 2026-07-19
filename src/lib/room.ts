import { ROOM_ID_LENGTH } from "@/types";

/**
 * Unambiguous alphabet — omits 0/O/1/I/L so room ids can be read aloud
 * over a call without being misheard.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const GROUP_SIZE = 3;

/** `ABC-DEF-GHJ` */
const ROOM_ID_PATTERN = new RegExp(
  `^[${ALPHABET}]{${GROUP_SIZE}}(?:-[${ALPHABET}]{${GROUP_SIZE}}){${ROOM_ID_LENGTH / GROUP_SIZE - 1}}$`,
);

/**
 * Generates a room id using the platform CSPRNG. Works in both the browser
 * and Node 18+, so the same helper backs the client and the signaling server.
 */
export function generateRoomId(): string {
  const bytes = new Uint8Array(ROOM_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);

  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP_SIZE) {
    groups.push(chars.slice(i, i + GROUP_SIZE).join(""));
  }
  return groups.join("-");
}

/**
 * Accepts user input in any shape (`abcdefghj`, `abc def ghj`, `ABC-DEF-GHJ`)
 * and returns the canonical form, or `null` when it cannot be a valid id.
 */
export function normalizeRoomId(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== ROOM_ID_LENGTH) return null;

  const groups: string[] = [];
  for (let i = 0; i < cleaned.length; i += GROUP_SIZE) {
    groups.push(cleaned.slice(i, i + GROUP_SIZE));
  }
  const candidate = groups.join("-");
  return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}

export function isValidRoomId(input: string): boolean {
  return normalizeRoomId(input) !== null;
}

/** Formats input as the user types, e.g. `abcd` -> `ABC-D`. */
export function formatRoomIdInput(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_ID_LENGTH);

  const groups: string[] = [];
  for (let i = 0; i < cleaned.length; i += GROUP_SIZE) {
    groups.push(cleaned.slice(i, i + GROUP_SIZE));
  }
  return groups.join("-");
}

/** `Ada Lovelace` -> `AL`, `cher` -> `CH` */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Curated identity colours.
 *
 * A free 0–360 hue gives every participant a different colour but no shared
 * character — the grid ends up looking like a pack of highlighters. These six
 * are picked to sit together against graphite and to stay clear of the amber
 * reserved for the accent, so a coloured avatar never reads as an indicator.
 */
const AVATAR_PALETTE: ReadonlyArray<{ from: string; to: string }> = [
  { from: "oklch(0.6 0.085 30)", to: "oklch(0.43 0.09 22)" }, // clay
  { from: "oklch(0.61 0.07 155)", to: "oklch(0.44 0.065 170)" }, // moss
  { from: "oklch(0.6 0.078 235)", to: "oklch(0.43 0.085 255)" }, // steel
  { from: "oklch(0.64 0.08 88)", to: "oklch(0.47 0.085 72)" }, // brass
  { from: "oklch(0.58 0.085 322)", to: "oklch(0.42 0.09 302)" }, // plum
  { from: "oklch(0.61 0.065 200)", to: "oklch(0.44 0.07 216)" }, // slate teal
];

/** Deterministic identity colour pair — a given name always gets the same one. */
export function getAvatarPalette(seed: string): { from: string; to: string } {
  return AVATAR_PALETTE[hashSeed(seed) % AVATAR_PALETTE.length];
}

/** Deterministic hue, still used where a single angle is more convenient. */
export function getAvatarHue(seed: string): number {
  return hashSeed(seed) % 360;
}

export function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function isValidName(name: string): boolean {
  const trimmed = sanitizeName(name);
  return trimmed.length >= 2 && trimmed.length <= 24;
}
