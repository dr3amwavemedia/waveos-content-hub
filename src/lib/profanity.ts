// Client-side mirror of public.text_has_blocked_language. Keep the word list
// in sync with the database function — the server check is the real gate,
// this one only gives instant feedback before the RPC round-trip.
const BLOCKED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "whore",
  "slut",
  "dick",
  "pussy",
  "nigger",
  "faggot",
  "retard",
];

const BLOCKED_PATTERN = new RegExp(`\\b(${BLOCKED_WORDS.join("|")})\\b`, "i");

export function containsProfanity(value: string): boolean {
  return BLOCKED_PATTERN.test(value);
}
