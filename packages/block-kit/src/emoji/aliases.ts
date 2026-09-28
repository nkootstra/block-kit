/**
 * Slack-specific shortcodes that predate today's standard Unicode emoji set and so aren't in
 * `emoji-datasource`. Slack keeps them as aliases into the standard set for backward compatibility.
 */
export const LEGACY_ALIASES: Record<string, string> = {
  // Slack's original "smile" glyph, kept as an alias for the standard slightly-smiling-face.
  simple_smile: "1f642",
};
