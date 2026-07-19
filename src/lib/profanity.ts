/**
 * Self-contained profanity matcher.
 *
 * Runs entirely in-process: no network, no model, no third-party package. It is
 * fed by the Web Speech API transcript, which is deliberately never persisted —
 * only the boolean signal and the matched terms leave this module.
 */

/**
 * Base wordlist. Kept deliberately moderate: strong profanity and slurs that a
 * moderator would act on, rather than every mild expletive. Plural and agent
 * forms are listed explicitly because the normaliser collapses repeated letters
 * but does not stem.
 */
const BASE_WORDS: readonly string[] = [
  "fuck",
  "fucks",
  "fucker",
  "fuckers",
  "fucking",
  "fuk",
  "fck",
  "phuck",
  "motherfucker",
  "motherfuckers",
  "motherfucking",
  "shit",
  "shits",
  "shitty",
  "shithead",
  "bullshit",
  "ass",
  "asses",
  "asshole",
  "assholes",
  "asshat",
  "dumbass",
  "jackass",
  "arse",
  "arsehole",
  "bitch",
  "bitches",
  "bitching",
  "bastard",
  "bastards",
  "cunt",
  "cunts",
  "dick",
  "dickhead",
  "cock",
  "cocksucker",
  "prick",
  "pussy",
  "twat",
  "wanker",
  "bollocks",
  "bugger",
  "piss",
  "pissed",
  "slut",
  "whore",
  "douchebag",
  "retard",
  "retarded",
  "faggot",
  "fag",
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "wetback",
  "tranny",
];

/**
 * Innocuous words whose *collapsed* form is indistinguishable from a listed
 * term. Checked against the raw (uncollapsed) token, so the real profanity
 * still matches: "as" is allowed, but "ass" — which also collapses to "as" —
 * is not, because the allowlist lookup happens before collapsing.
 */
const ALLOWLIST: ReadonlySet<string> = new Set([
  "as",
  "assess", // collapses to "ases", same as the plural "asses"
  "niger", // the country; "nigger" collapses to the same form
  "bas",
  "bos",
]);

const LEET_MAP: ReadonlyMap<string, string> = new Map([
  ["4", "a"],
  ["@", "a"],
  ["3", "e"],
  ["1", "i"],
  ["!", "i"],
  ["0", "o"],
  ["5", "s"],
  ["$", "s"],
  ["7", "t"],
]);

/** Strips accents so "fück" and "fuck" normalise to the same token. */
function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function applyLeet(token: string): string {
  let out = "";
  for (const char of token) {
    out += LEET_MAP.get(char) ?? char;
  }
  return out;
}

/** "fuuuck" -> "fuck", "sssh" -> "sh" */
function collapseRepeats(input: string): string {
  return input.replace(/(.)\1+/g, "$1");
}

/**
 * Splits text into comparable word tokens.
 *
 * Leetspeak substitution is applied *per token* and only when the token already
 * contains a letter, so pure digit runs such as "455" are not silently rewritten
 * into "ass".
 */
function tokenize(text: string): string[] {
  const lowered = stripDiacritics(text.toLowerCase());
  const rawTokens = lowered.split(/[^a-z0-9@!$]+/);

  const tokens: string[] = [];
  for (const raw of rawTokens) {
    if (raw.length === 0 || !/[a-z]/.test(raw)) continue;
    const letters = applyLeet(raw).replace(/[^a-z]/g, "");
    if (letters.length > 0) tokens.push(letters);
  }
  return tokens;
}

/** Collapsed form -> canonical term, so matches report the dictionary spelling. */
const lookup = new Map<string, string>();

function registerWord(word: string): void {
  const [normalized] = tokenize(word);
  if (!normalized) return;
  const key = collapseRepeats(normalized);
  if (!lookup.has(key)) lookup.set(key, word);
}

for (const word of BASE_WORDS) registerWord(word);

/** Extends the base list at runtime, e.g. from room configuration. */
export function addCustomWords(words: string[]): void {
  for (const word of words) registerWord(word);
}

function matchToken(token: string): string | null {
  if (ALLOWLIST.has(token)) return null;

  const direct = lookup.get(collapseRepeats(token));
  if (direct) return direct;

  // Cheap plural handling: "fucks" is listed, but a custom word might not be.
  if (token.length > 3 && token.endsWith("s")) {
    const singular = token.slice(0, -1);
    if (ALLOWLIST.has(singular)) return null;
    return lookup.get(collapseRepeats(singular)) ?? null;
  }

  return null;
}

/**
 * Scans `text` for profanity.
 *
 * **Scunthorpe safety:** matching is token-exact, never substring. The text is
 * split into whole words and each word is compared in full against the
 * dictionary, so an offensive term embedded inside a longer legitimate word
 * ("class", "assess", "grass", "Cockburn", "analysis", "shitake") can never
 * produce a hit — there is no `indexOf`/unanchored regex anywhere in the path.
 */
export function containsProfanity(text: string): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  const seen = new Set<string>();

  for (const token of tokenize(text)) {
    const hit = matchToken(token);
    if (hit && !seen.has(hit)) {
      seen.add(hit);
      matches.push(hit);
    }
  }

  return { found: matches.length > 0, matches };
}
