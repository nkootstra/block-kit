/**
 * Reference names. A reference is a fixture captured in Block Kit Builder in one state:
 *
 *   <fixture>[@<interaction>][+mobile][+dark]
 *
 * - `<fixture>` is the payload's path under fixtures/ (`catalog/actions/button`).
 * - `<interaction>` is what was done to Slack's preview before the capture: `expanded`, `sort-asc`,
 *   or one of the open states `open` (a select, time list, calendar or overflow menu opened),
 *   `confirm` (a confirm dialog) and `dialog` (a section accessory's multi-select dialog). compare.ts
 *   replays it on our rendering (STATES / OPEN_STATES).
 * - `mobile`: captured in the Builder's Mobile preview, compared at its width.
 * - `dark`: captured with the Builder in its dark theme, compared against our dark theme.
 *
 * The parts after `@` always come in that order (`@open+mobile+dark`), so a state has one name;
 * a plain fixture name is the light, desktop, closed state.
 */

export interface ReferenceName {
  fixture: string;
  interaction?: string;
  theme: "light" | "dark";
  mobile: boolean;
}

const FIXTURE = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const TOKEN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODIFIERS = ["mobile", "dark"] as const;

export function parseReferenceName(name: string): ReferenceName {
  const [fixture = name, suffix] = name.split("@");
  const tokens = suffix ? suffix.split("+") : [];
  const interaction =
    tokens[0] && !(MODIFIERS as readonly string[]).includes(tokens[0]) ? tokens[0] : undefined;
  return {
    fixture,
    interaction,
    theme: tokens.includes("dark") ? "dark" : "light",
    mobile: tokens.includes("mobile"),
  };
}

export function formatReferenceName({
  fixture,
  interaction,
  theme,
  mobile,
}: ReferenceName): string {
  const tokens = [
    interaction,
    mobile ? "mobile" : undefined,
    theme === "dark" ? "dark" : undefined,
  ].filter((t): t is string => Boolean(t));
  return tokens.length > 0 ? `${fixture}@${tokens.join("+")}` : fixture;
}

/** Whether `name` is a well-formed reference name, written in its one canonical order. */
export function isReferenceName(name: string): boolean {
  if (name.includes("..") || name.split("@").length > 2) return false;
  const [fixture = "", suffix] = name.split("@");
  if (!FIXTURE.test(fixture)) return false;
  if (suffix === undefined) return true;
  const tokens = suffix.split("+");
  if (tokens.some((t) => !TOKEN.test(t))) return false;
  return formatReferenceName(parseReferenceName(name)) === name;
}
