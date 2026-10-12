/**
 * Reference names. A reference is a fixture captured in Block Kit Builder in one state:
 *
 *   <fixture>[@<interaction>][+mobile][+full][+dark]
 *
 * - `<fixture>` is the payload's path under fixtures/ (`catalog/actions/button`).
 * - `<interaction>` is what was done to Slack's preview before the capture: `expanded`, `sort-asc`,
 *   or one of the open states `open` (a select, time list, calendar or overflow menu opened),
 *   `confirm` (a confirm dialog) and `dialog` (a section accessory's multi-select dialog). compare.ts
 *   replays it on our rendering (STATES / OPEN_STATES).
 *   Two more hold real input while the snapshot is taken: `hover-<target>` (the pointer resting on
 *   the control) and `focus-<target>` (keyboard focus, so `:focus-visible` matches), where
 *   `<target>` is a control address such as `button-2` (targets.ts). `submit-errors` presses a
 *   modal's submit with its fields as the payload leaves them. A behaviour probe that ends in a
 *   snapshot names its reference after itself (probes.ts). `scrolled-end` scrolls the first
 *   horizontal scroll container that overflows fully to the right.
 * - `mobile`: captured in the Builder's Mobile preview, compared at its width.
 * - `full`: captured with the preview widened by what its horizontal scroll containers hide and
 *   those containers expanded to their scroll width, so wide content (a chart's card, a table, a
 *   carousel) is compared in full; ours is rendered at the reference's width and expanded the same
 *   way. It's a layout variant of the same state, like `mobile`, so it's a modifier rather than an
 *   interaction: it combines with any interaction, width and theme.
 * - `dark`: captured with the Builder in its dark theme, compared against our dark theme.
 *
 * The parts after `@` always come in that order (`@open+mobile+full+dark`), so a state has one name;
 * a plain fixture name is the light, desktop, closed state.
 */

import { parseTarget, type Target } from "./targets";

export interface ReferenceName {
  fixture: string;
  interaction?: string;
  theme: "light" | "dark";
  mobile: boolean;
  /** Set only when true: the `+full` layout. */
  full?: boolean;
}

const FIXTURE = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const TOKEN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODIFIERS = ["mobile", "full", "dark"] as const;

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
    ...(tokens.includes("full") && { full: true }),
  };
}

export function formatReferenceName({
  fixture,
  interaction,
  theme,
  mobile,
  full,
}: ReferenceName): string {
  const tokens = [
    interaction,
    mobile ? "mobile" : undefined,
    full ? "full" : undefined,
    theme === "dark" ? "dark" : undefined,
  ].filter((t): t is string => Boolean(t));
  return tokens.length > 0 ? `${fixture}@${tokens.join("+")}` : fixture;
}

/** Real input held while a reference is captured. */
export interface InputState {
  input: "hover" | "focus";
  target: Target;
}

const INPUTS = ["hover", "focus"] as const;

/**
 * The input an interaction holds (`hover-button-2`), undefined for any other interaction. Throws
 * on an interaction that starts like one but doesn't address a control (`hover-buton-1`).
 */
export function parseInputState(interaction: string | undefined): InputState | undefined {
  const input = INPUTS.find((i) => interaction?.startsWith(`${i}-`));
  if (!input || !interaction) return undefined;
  const target = parseTarget(interaction.slice(input.length + 1));
  if (!target)
    throw new Error(
      `${interaction}: ${input}- takes a control address such as ${input}-button-1 (targets.ts)`,
    );
  return { input, target };
}

/** Whether `name` is a well-formed reference name, written in its one canonical order. */
export function isReferenceName(name: string): boolean {
  if (name.includes("..") || name.split("@").length > 2) return false;
  const [fixture = "", suffix] = name.split("@");
  if (!FIXTURE.test(fixture)) return false;
  if (suffix === undefined) return true;
  const tokens = suffix.split("+");
  if (tokens.some((t) => !TOKEN.test(t))) return false;
  const parsed = parseReferenceName(name);
  try {
    parseInputState(parsed.interaction);
  } catch {
    return false;
  }
  return formatReferenceName(parsed) === name;
}
