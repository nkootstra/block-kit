/**
 * Checks for payload values that reach a style or a class. A message comes from whoever wrote it,
 * and a server render writes both into the HTML as the string it was given: a `;` in a style value
 * starts a new declaration, and a space in a class adds another class. Payloads are untyped JSON,
 * so a value typed as a string here may be a number, an array or an object.
 */

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A CSS hex colour (`#` and 3, 4, 6 or 8 hex digits), or `undefined`. */
export function hexColor(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : undefined;
}

const CLASS_MODIFIER = /^[a-z0-9_-]+$/i;

/** A value to put after a class's `--`, as one class: letters, digits, `_` and `-`, or `undefined`. */
export function classModifier(value: unknown): string | undefined {
  return typeof value === "string" && CLASS_MODIFIER.test(value) ? value : undefined;
}
