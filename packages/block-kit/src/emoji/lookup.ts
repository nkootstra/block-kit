import { LEGACY_ALIASES } from "./aliases";
import { EMOJI_NAMES, EMOJI_SKIN_TONES } from "./data.generated";

const ALL_NAMES: Record<string, string> = { ...EMOJI_NAMES, ...LEGACY_ALIASES };

export type ResolvedEmoji = { kind: "unicode"; unified: string } | { kind: "custom"; url: string };

/**
 * Resolves a `:name:` shortcode to a Unicode codepoint or a workspace custom emoji URL.
 * `custom` entries may point at a URL, or `alias:<name>` to point at another emoji (which may
 * itself be a standard one). Returns null when the name isn't recognized.
 */
export function resolveEmoji(
  name: string,
  skinTone: number | undefined,
  custom: Record<string, string> | undefined,
): ResolvedEmoji | null {
  if (custom) {
    let current = name;
    const seen = new Set<string>();
    while (Object.hasOwn(custom, current) && !seen.has(current)) {
      seen.add(current);
      const value = custom[current];
      if (typeof value !== "string") break;
      if (value.startsWith("alias:")) {
        current = value.slice("alias:".length);
        continue;
      }
      return { kind: "custom", url: value };
    }
  }

  const unified = ALL_NAMES[name.toLowerCase()];
  if (!unified) return null;

  if (skinTone && skinTone >= 2 && skinTone <= 6) {
    const variant = EMOJI_SKIN_TONES[unified]?.[skinTone - 2];
    if (variant) return { kind: "unicode", unified: variant };
  }
  return { kind: "unicode", unified };
}

const SKIN_TONE_MODIFIERS = ["1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"];

/**
 * The `skin-tone-N` (2-6) a rich-text emoji's `unicode` carries, e.g. 4 for `1f44b-1f3fd`; Slack
 * draws the emoji in that tone.
 */
export function skinToneOf(unicode: string | undefined): number | undefined {
  const codepoints = unicode?.toLowerCase().split("-") ?? [];
  const at = SKIN_TONE_MODIFIERS.findIndex((modifier) => codepoints.includes(modifier));
  return at === -1 ? undefined : at + 2;
}

/** Apple emoji set served from jsDelivr, Slack's own image source for standard emoji. */
export function defaultEmojiImageUrl(unified: string): string {
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/${unified}.png`;
}
