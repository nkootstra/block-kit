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

/*
 * Shape checks. Any field of a payload can be missing or of another type, and a render that calls
 * `.map` on a number or renders an object as text throws, which takes down the host's whole tree or
 * server response. Read payload fields through these instead of trusting the Block Kit types.
 */

/** `value` if it is an array, otherwise an empty one. */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `value` if it is an object (not null and not an array), or `undefined`. */
export function asObject<T = Record<string, unknown>>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as T)
    : undefined;
}

/** The objects in `value` when it is an array, skipping anything else (nulls, strings, arrays). */
export function objectsIn<T = Record<string, unknown>>(value: unknown): T[] {
  return asArray(value).filter((item) => asObject(item) !== undefined) as T[];
}

/** `value` if it is a string, or `undefined`. */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * `table[key]` when `key` is one of `table`'s own keys. A payload string such as `"constructor"` or
 * `"__proto__"` would otherwise find a value on `Object.prototype`.
 */
export function own<T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined {
  return typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined;
}
