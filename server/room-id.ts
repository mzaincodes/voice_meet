import { randomBytes } from "node:crypto";

/**
 * Deliberate duplicate of `src/lib/room.ts`. The signaling server runs outside
 * the Next.js build (plain tsx + ESM), so it cannot resolve the `@/` alias.
 * Ids produced here must stay byte-for-byte interchangeable with the client's.
 */

/** Unambiguous alphabet — omits 0/O/1/I/L so ids survive being read aloud. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const ROOM_ID_LENGTH = 9;
const GROUP_SIZE = 3;

/** `ABC-DEF-GHJ` */
const ROOM_ID_PATTERN = new RegExp(
  `^[${ALPHABET}]{${GROUP_SIZE}}(?:-[${ALPHABET}]{${GROUP_SIZE}}){${ROOM_ID_LENGTH / GROUP_SIZE - 1}}$`,
);

/**
 * Largest multiple of the alphabet size that fits in a byte. Bytes at or above
 * this are rejected rather than folded, which keeps every character equally
 * likely instead of biasing the first `256 % 31` symbols.
 */
const REJECTION_CEILING = 256 - (256 % ALPHABET.length);

function group(chars: string): string {
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP_SIZE) {
    groups.push(chars.slice(i, i + GROUP_SIZE));
  }
  return groups.join("-");
}

export function generateRoomId(): string {
  let chars = "";
  while (chars.length < ROOM_ID_LENGTH) {
    const bytes = randomBytes(ROOM_ID_LENGTH);
    for (const byte of bytes) {
      if (byte >= REJECTION_CEILING) continue;
      chars += ALPHABET[byte % ALPHABET.length];
      if (chars.length === ROOM_ID_LENGTH) break;
    }
  }
  return group(chars);
}

/**
 * Accepts user input in any shape (`abcdefghj`, `abc def ghj`, `ABC-DEF-GHJ`)
 * and returns the canonical form, or `null` when it cannot be a valid id.
 */
export function normalizeRoomId(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== ROOM_ID_LENGTH) return null;

  const candidate = group(cleaned);
  return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}

export function isValidRoomId(input: string): boolean {
  return normalizeRoomId(input) !== null;
}

export function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function isValidName(name: string): boolean {
  const trimmed = sanitizeName(name);
  return trimmed.length >= 2 && trimmed.length <= 24;
}
