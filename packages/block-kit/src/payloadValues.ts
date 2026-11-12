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
 * `value` if it names a time zone the runtime knows, or `undefined`, which formats in the viewer's
 * zone. `Intl` throws on any other zone, such as a user's `tz` a host passes on as it is.
 */
export function knownTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

/**
 * `table[key]` when `key` is one of `table`'s own keys. A payload string such as `"constructor"` or
 * `"__proto__"` would otherwise find a value on `Object.prototype`.
 */
export function own<T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined {
  return typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Keys JavaScript calls to turn an object into a string or a number. */
const COERCION_KEYS: readonly string[] = ["toString", "valueOf"];
/** Far deeper than anything renders (blocks nest at most 32 deep); below it a payload is as given. */
const MAX_INERT_DEPTH = 1000;

/**
 * `payload` with every object that has its own `toString` or `valueOf` that isn't a function (as
 * JSON such as `{"toString": 1}` does) copied without those keys. JavaScript calls them to turn an
 * object into text, as React does for a key or an attribute and a template literal does, and one
 * that isn't a function throws, wherever the payload has it. A payload without one comes back as
 * the same objects, so it keeps its identity. It is checked again on every call, since a host may
 * change a payload object in place between renders.
 */
export function inert<T>(payload: T): T {
  return inertAt(payload, 0, new Map()) as T;
}

/** `seen` maps each object of this call to its result, so a shared or cyclic object is walked once. */
function inertAt(value: unknown, depth: number, seen: Map<object, unknown>): unknown {
  if (typeof value !== "object" || value === null || depth >= MAX_INERT_DEPTH) return value;
  if (seen.has(value)) return seen.get(value);
  const isArray = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) return value;
  // Marked before the walk, so an object that contains itself ends it.
  seen.set(value, value);

  const source = value as Record<string, unknown>;
  let changed = false;
  const entries: [string, unknown][] = [];
  for (const key of Object.keys(source)) {
    const item = source[key];
    if (!isArray && COERCION_KEYS.includes(key) && typeof item !== "function") {
      changed = true;
      continue;
    }
    const clean = inertAt(item, depth + 1, seen);
    if (clean !== item) changed = true;
    entries.push([key, clean]);
  }
  if (!changed) return value;

  const copy: object = isArray ? [...(value as unknown[])] : {};
  for (const [key, item] of entries) {
    // defineProperty, not assignment: a `__proto__` key stays an own key, as JSON.parse leaves it.
    Object.defineProperty(copy, key, {
      value: item,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  seen.set(value, copy);
  return copy;
}
