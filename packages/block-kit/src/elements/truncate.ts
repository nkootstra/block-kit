/**
 * Slack's own cut of a long label: the first `max` characters, without trailing spaces, and "…".
 * It cuts the text itself, not with CSS, so the label stays one line however wide its row is.
 */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("").trimEnd()}…` : text;
}

/** A button's label (`extra/fidelity/button/long-content`). */
export const BUTTON_LABEL_MAX = 40;

/** A section accessory multi-select's placeholder, on the button that opens its dialog
 * (`extra/fidelity/multi-conversations-select/long-content`). */
export const DIALOG_TRIGGER_MAX = 30;
