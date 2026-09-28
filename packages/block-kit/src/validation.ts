import type { ElementState, StateValues } from "./context";
import type { Json } from "./types";

/**
 * The checks Slack's client runs on a modal before it sends `view_submission`: required inputs,
 * text length, number format/range, and email/URL format. A failing field shows its message under
 * the input and the submission never reaches the app.
 *
 * Slack doesn't document the exact wording; these follow its client's phrasing as closely as we
 * know it and live here so they can be adjusted in one place.
 */
export const VALIDATION_MESSAGES = {
  required: "Please complete this required field.",
  minLength: (n: number) => `Please enter at least ${n} character${n === 1 ? "" : "s"}.`,
  maxLength: (n: number) => `Please enter no more than ${n} character${n === 1 ? "" : "s"}.`,
  number: "Please enter a number.",
  wholeNumber: "Please enter a whole number.",
  minValue: (min: string) => `Please enter a number greater than or equal to ${min}.`,
  maxValue: (max: string) => `Please enter a number less than or equal to ${max}.`,
  email: "Please enter a valid email address.",
  url: "Please enter a valid URL.",
};

/** Same rule as `<input type="email">`: something@something, no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/** Whether a rich_text value holds any non-blank text, or anything that isn't text (a mention, emoji…). */
function hasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const { type, text, elements } = node as Json;
  if (type === "text") return typeof text === "string" && text.trim() !== "";
  if (Array.isArray(elements)) return elements.some(hasText);
  return type !== "rich_text" && !String(type).startsWith("rich_text_");
}

function isEmpty(state: ElementState | undefined): boolean {
  if (!state) return true;
  return Object.entries(state).every(([key, value]) => {
    if (key === "type") return true;
    if (value === null || value === undefined || value === "") return true;
    if (Array.isArray(value)) return value.length === 0;
    // rich_text_input: a rich_text block whose sections hold no text at all.
    if (typeof value === "object" && (value as Json).type === "rich_text") {
      return !hasText(value);
    }
    return false;
  });
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function checkValue(element: Json, value: string): string | undefined {
  switch (element.type) {
    case "plain_text_input": {
      if (typeof element.min_length === "number" && value.length < element.min_length) {
        return VALIDATION_MESSAGES.minLength(element.min_length);
      }
      if (typeof element.max_length === "number" && value.length > element.max_length) {
        return VALIDATION_MESSAGES.maxLength(element.max_length);
      }
      return undefined;
    }
    case "email_text_input":
      return EMAIL.test(value) ? undefined : VALIDATION_MESSAGES.email;
    case "url_text_input":
      return isUrl(value) ? undefined : VALIDATION_MESSAGES.url;
    case "number_input": {
      const n = Number(value);
      if (value.trim() === "" || Number.isNaN(n)) return VALIDATION_MESSAGES.number;
      if (!element.is_decimal_allowed && !Number.isInteger(n)) {
        return VALIDATION_MESSAGES.wholeNumber;
      }
      if (element.min_value !== undefined && n < Number(element.min_value)) {
        return VALIDATION_MESSAGES.minValue(String(element.min_value));
      }
      if (element.max_value !== undefined && n > Number(element.max_value)) {
        return VALIDATION_MESSAGES.maxValue(String(element.max_value));
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Validates a view's `input` blocks against `state.values` the way Slack's client does before a
 * submission. Returns errors keyed by block_id (the shape of `response_action: "errors"`); empty
 * when the view may be submitted.
 */
export function validateView(
  blocks: readonly Json[] | readonly unknown[],
  state: StateValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  (blocks as Json[]).forEach((block, index) => {
    if (block.type !== "input" || !block.element) return;
    const blockId = typeof block.block_id === "string" ? block.block_id : `block-${index}`;
    const element = block.element as Json;
    const entry = state[blockId]?.[(element.action_id as string | undefined) ?? ""];

    if (isEmpty(entry)) {
      if (!block.optional) errors[blockId] = VALIDATION_MESSAGES.required;
      return;
    }
    const value = entry?.value;
    if (typeof value === "string") {
      const error = checkValue(element, value);
      if (error) errors[blockId] = error;
    }
  });
  return errors;
}
