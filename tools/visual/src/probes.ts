/**
 * Behaviour probes: what Slack does when a control is driven, step by step, recorded in Block Kit
 * Builder and replayed on our rendering.
 *
 * A probe is `fixtures/<fixture>@<probe>.probe.json`, next to its fixture, written by whoever adds
 * the fixture:
 *
 *   { "steps": [{ "click": "field-1" }, { "key": "ArrowDown" }, { "key": "Enter" }] }
 *
 * - `{ "click": <target> }`, `{ "hover": <target> }`: a control address (`field-1`, targets.ts) or
 *   `{ "role": "option", "name": "Bravo" }`, the element with that role (written down, or by its
 *   tag, IMPLICIT_ROLES: a link, a button) whose text (or aria-label) is the name, in the message or
 *   an open layer: an option in an open list, a menu item, a link.
 * - `{ "key": "ArrowDown" }`: a key press to whatever has focus, with Playwright's names
 *   (`Shift+Tab`, `Space`).
 * - `{ "type": "hello" }`: typed into whatever has focus.
 * - `{ "wait": 300 }`: milliseconds.
 * - `{ "scroll": "scroller-1", "left": "end" }`: scrolls a block that scrolls itself (a carousel, a
 *   data table, a wide table) to `left` and/or `top`, in pixels or `"end"`. Scripted on both sides:
 *   a scroll needs no trusted input. Observations record each scroller's offsets.
 * - `{ "snapshot": "open-hover-option-2" }`: captures a reference at that point, named
 *   `<fixture>@<label>` (with the item's theme and width). compare.ts replays the steps before it;
 *   a hover right before it is held through it. This is how a state that takes more than one
 *   interaction (a list opened, then an option hovered) becomes a reference.
 * - `"snapshot": true` also captures a reference named after the probe (`<fixture>@<probe>`) once
 *   the steps are done; compare.ts replays the steps for it. (Block Kit Builder doesn't validate a
 *   modal, so a probe that fills a field wrongly and submits shows no errors.)
 *
 * capture.js runs the steps in the Builder, each with real input, and observes the preview before
 * the first step and after each (observe.js). import.ts writes the recording to
 * `fixtures/<fixture>@<probe>.behaviour.json`, maintainer-owned like the `.actions.json` payload
 * recordings, and the last Actions Preview payload the probe produced, if any, to
 * `<fixture>@<probe>.actions.json`. This file replays a recording's steps on our rendering with
 * Playwright's real pointer and keyboard and lists where our observations differ:
 *
 *   bun tools/visual/src/probes.ts [fixture-prefix...] [--base=http://localhost:5180] [--check]
 *
 * Probes sit next to their fixture, like the payload recordings, because they're as specific to a
 * payload as a recording is: bundle.ts ships them to the Builder with the payload, and the
 * package's payload test reads them from fixtures/ to replay a probe's payload.
 */
import { join } from "node:path";
import { Glob } from "bun";
import type { Page } from "playwright";
import { parseInputState } from "./names";
import { findTarget, OURS, ourRoot, parseTarget } from "./targets";

export type TargetSpec = string | { role: string; name: string };
export type Step =
  | { click: TargetSpec }
  | { hover: TargetSpec }
  | { key: string }
  | { type: string }
  | { wait: number }
  | { scroll: TargetSpec; left?: number | "end"; top?: number | "end" }
  | { snapshot: string };

export interface Probe {
  steps: Step[];
  snapshot?: boolean;
}

export interface Observation {
  focus: { target: string | null; role: string | null; name: string; where: string } | null;
  layers: { kind: "popover" | "dialog"; role: string | null; scrollTop: number }[];
  activeOption: string | null;
  /** A tooltip showing, and whether anything is loading; absent in older recordings. */
  tooltip?: string | null;
  busy?: boolean;
  /** Controls that report a state (aria-expanded, -pressed, -current, -selected, -sort, …). */
  controls: Record<string, Record<string, string | boolean | undefined>>;
  /** Slack only: the payload Actions Preview showed after the step, or null. */
  action?: unknown;
}

/** What import.ts writes to `<fixture>@<probe>.behaviour.json`. */
export interface Behaviour {
  steps: Step[];
  /** Before the first step, then after each. */
  observations: Observation[];
  /** `@submit-errors` only: whether pressing submit changed the preview. */
  changed?: boolean;
}

const FIXTURES = join(import.meta.dir, "../../../fixtures");
const LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Interactions every fixture can have; a snapshot step's label can't reuse one. */
const RESERVED = new Set(["open", "confirm", "dialog", "submit-errors", "scrolled-end"]);

function parseTargetSpec(value: unknown, where: string): TargetSpec {
  if (typeof value === "string") {
    if (!parseTarget(value)) throw new Error(`${where}: "${value}" isn't a control address`);
    return value;
  }
  const spec = value as { role?: unknown; name?: unknown } | null;
  if (
    spec &&
    typeof spec === "object" &&
    typeof spec.role === "string" &&
    typeof spec.name === "string" &&
    Object.keys(spec).length === 2
  )
    return { role: spec.role, name: spec.name };
  throw new Error(`${where}: a target is a control address or { role, name }`);
}

/** Validates a probe file's contents. */
export function parseProbe(value: unknown): Probe {
  const raw = value as { steps?: unknown; snapshot?: unknown } | null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.steps) || raw.steps.length === 0)
    throw new Error("a probe is { steps: [...] } with at least one step");
  for (const key of Object.keys(raw))
    if (key !== "steps" && key !== "snapshot") throw new Error(`a probe has no "${key}"`);
  if (raw.snapshot !== undefined && typeof raw.snapshot !== "boolean")
    throw new Error("snapshot is true or false");
  const steps = raw.steps.map((s, i): Step => {
    const step = s as Record<string, unknown>;
    const where = `step ${i + 1}`;
    const keys = step && typeof step === "object" ? Object.keys(step) : [];
    if (keys.includes("scroll")) {
      const offset = (v: unknown) => v === undefined || v === "end" || typeof v === "number";
      const extra = keys.filter((k) => !["scroll", "left", "top"].includes(k));
      if (extra.length > 0 || !offset(step.left) || !offset(step.top) || keys.length < 2)
        throw new Error(`${where}: a scroll takes a target and left or top (pixels or "end")`);
      return {
        scroll: parseTargetSpec(step.scroll, where),
        ...(step.left !== undefined && { left: step.left as number | "end" }),
        ...(step.top !== undefined && { top: step.top as number | "end" }),
      };
    }
    if (keys.length !== 1)
      throw new Error(`${where}: one of click, hover, key, type, wait, scroll or snapshot`);
    const [kind] = keys as [string];
    const v = step[kind];
    if (kind === "click") return { click: parseTargetSpec(v, where) };
    if (kind === "hover") return { hover: parseTargetSpec(v, where) };
    if (kind === "key" && typeof v === "string" && v !== "") return { key: v };
    if (kind === "type" && typeof v === "string") return { type: v };
    if (kind === "wait" && typeof v === "number" && v >= 0 && v <= 10_000) return { wait: v };
    if (kind === "snapshot" && typeof v === "string" && LABEL.test(v)) {
      if (parseInputState(v) || RESERVED.has(v))
        throw new Error(
          `${where}: "${v}" is a generic state's name; name the snapshot after what it shows`,
        );
      return { snapshot: v };
    }
    throw new Error(`${where}: ${kind} ${JSON.stringify(v)} isn't a step`);
  });
  return raw.snapshot ? { steps, snapshot: true } : { steps };
}

/**
 * The references a probe captures: its own name when it ends in a snapshot, and each snapshot
 * step's label, with the steps that lead there.
 */
export function probeSnapshots(probes: Map<string, Probe>): Map<string, Step[]> {
  const out = new Map<string, Step[]>();
  for (const [name, probe] of probes) {
    const fixture = name.split("@")[0]!;
    probe.steps.forEach((step, i) => {
      if ("snapshot" in step) out.set(`${fixture}@${step.snapshot}`, probe.steps.slice(0, i));
    });
    if (probe.snapshot) out.set(name, probe.steps);
  }
  return out;
}

/** Every probe under fixtures/, keyed `<fixture>@<probe>`. */
export async function readProbes(root = FIXTURES): Promise<Map<string, Probe>> {
  const probes = new Map<string, Probe>();
  for await (const path of new Glob("**/*.probe.json").scan(root)) {
    const name = path.replace(/\.probe\.json$/, "");
    try {
      probes.set(name, parseProbe(await Bun.file(join(root, path)).json()));
    } catch (err) {
      throw new Error(`${path}: ${(err as Error).message}`, { cause: err });
    }
  }
  return probes;
}

/**
 * The elements a `{ role }` target can be: the role written down, or the one an element has by its
 * tag. capture.js and the package's payload test carry the same list.
 */
export const IMPLICIT_ROLES: Record<string, string> = {
  link: "a[href]",
  button: "button",
  checkbox: 'input[type="checkbox"]',
  radio: 'input[type="radio"]',
  textbox: 'textarea, input:not([type]), input[type="text"]',
};

export const roleSelector = (role: string) =>
  [`[role="${role}"]`, IMPLICIT_ROLES[role]].filter(Boolean).join(", ");

/** Our element for a step's target, on the playground's render page or the interaction harness. */
async function locate(page: Page, spec: TargetSpec) {
  if (typeof spec === "string") {
    const target = parseTarget(spec)!;
    const handle = await page.evaluateHandle(findTarget, [
      OURS[target.kind],
      target.index,
      ourRoot(target.kind),
    ] as [string, number, string | null]);
    const el = handle.asElement();
    if (!el) throw new Error(`our rendering has no ${spec}`);
    return el;
  }
  // The role and the text, as capture.js matches them in the Builder.
  const handle = await page.evaluateHandle(
    ([selector, name]) =>
      [...document.querySelectorAll(selector)].find(
        (el) =>
          el.getClientRects().length > 0 &&
          (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim() ===
            name,
      ) ?? null,
    [roleSelector(spec.role), spec.name] as const,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`our rendering has no ${spec.role} "${spec.name}"`);
  return el;
}

/** Performs the steps on our rendering with Playwright's real pointer and keyboard. */
export async function runSteps(page: Page, steps: Step[]): Promise<void> {
  for (const step of steps) await runStep(page, step);
}

export async function runStep(page: Page, step: Step): Promise<void> {
  if ("snapshot" in step) return;
  if ("wait" in step) await page.waitForTimeout(step.wait);
  else if ("scroll" in step) {
    const { left, top } = step;
    await (
      await locate(page, step.scroll)
    ).evaluate(
      (el, [l, t]) => {
        const to = (v: number | "end" | undefined, max: number, now: number) =>
          v === undefined ? now : v === "end" ? max : v;
        el.scrollTo({
          left: to(l, el.scrollWidth, el.scrollLeft),
          top: to(t, el.scrollHeight, el.scrollTop),
          behavior: "instant",
        });
      },
      [left, top] as const,
    );
  } else if ("key" in step) await page.keyboard.press(step.key);
  else if ("type" in step) await page.keyboard.type(step.type);
  else if ("hover" in step) await (await locate(page, step.hover)).hover();
  else await (await locate(page, step.click)).click();
}

// A bare function expression; the file ends its statement with a semicolon.
const OBSERVE = Bun.file(join(import.meta.dir, "observe.js"))
  .text()
  .then((text) => text.trim().replace(/;$/, ""));

/** observe.js on our side of the page. */
export async function observeOurs(page: Page): Promise<Observation> {
  return page.evaluate(`(${await OBSERVE})(window, { side: "ours" })`) as Promise<Observation>;
}

/**
 * Replays a recording on our rendering: observes before the first step and after each, letting
 * transitions finish as capture.js does.
 */
export async function replay(page: Page, steps: Step[]): Promise<Observation[]> {
  const settle = () => page.waitForTimeout(400);
  const observations = [await observeOurs(page)];
  for (const step of steps) {
    await runStep(page, step);
    await settle();
    observations.push(await observeOurs(page));
  }
  return observations;
}

/** A name that stands for a workspace member or channel matches any name. */
const sameName = (slack: string, ours: string) =>
  slack === ours || slack === "<member>" || slack === "<channel>";

/**
 * Where our observations differ from Slack's, one line per difference:
 * `after step 2 (key ArrowDown): focus.role: Slack option, ours combobox`.
 */
export function diffObservations(
  steps: Step[],
  slack: Observation[],
  ours: Observation[],
): string[] {
  const lines: string[] = [];
  slack.forEach((s, i) => {
    const o = ours[i];
    const when =
      i === 0 ? "before the first step" : `after step ${i} (${describeStep(steps[i - 1])})`;
    if (!o) {
      lines.push(`${when}: not observed on ours`);
      return;
    }
    const differ = (what: string, a: unknown, b: unknown) => {
      if (JSON.stringify(a) !== JSON.stringify(b))
        lines.push(`${when}: ${what}: Slack ${show(a)}, ours ${show(b)}`);
    };
    differ("focus.where", s.focus?.where, o.focus?.where);
    differ("focus.target", s.focus?.target, o.focus?.target);
    differ("focus.role", s.focus?.role, o.focus?.role);
    if (s.focus && o.focus && !sameName(s.focus.name, o.focus.name))
      differ("focus.name", s.focus.name, o.focus.name);
    differ(
      "layers",
      s.layers.map((l) => `${l.kind}${l.role ? ` ${l.role}` : ""}`),
      o.layers.map((l) => `${l.kind}${l.role ? ` ${l.role}` : ""}`),
    );
    s.layers.forEach((l, j) => {
      const ol = o.layers[j];
      if (ol) differ(`layers.${j}.scrollTop`, l.scrollTop, ol.scrollTop);
    });
    if (!(s.activeOption && o.activeOption && sameName(s.activeOption, o.activeOption)))
      differ("activeOption", s.activeOption, o.activeOption);
    if (s.tooltip !== undefined) differ("tooltip", s.tooltip, o.tooltip);
    if (s.busy !== undefined) differ("busy", s.busy, o.busy);
    for (const address of new Set([...Object.keys(s.controls), ...Object.keys(o.controls)])) {
      const a = s.controls[address] ?? {};
      const b = o.controls[address] ?? {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const [x, y] = [a[key], b[key]];
        if (key === "value" && typeof x === "string" && typeof y === "string" && sameName(x, y))
          continue;
        differ(`${address}.${key}`, a[key], b[key]);
      }
    }
  });
  return lines;
}

const show = (v: unknown) => (v === undefined ? "missing" : JSON.stringify(v));

export function describeStep(step: Step | undefined): string {
  if (!step) return "?";
  const target = (t: TargetSpec) => (typeof t === "string" ? t : `${t.role} "${t.name}"`);
  if ("click" in step) return `click ${target(step.click)}`;
  if ("hover" in step) return `hover ${target(step.hover)}`;
  if ("key" in step) return `key ${step.key}`;
  if ("type" in step) return `type ${JSON.stringify(step.type)}`;
  if ("scroll" in step)
    return `scroll ${target(step.scroll)}${step.left !== undefined ? ` left ${step.left}` : ""}${step.top !== undefined ? ` top ${step.top}` : ""}`;
  if ("snapshot" in step) return `snapshot ${step.snapshot}`;
  return `wait ${step.wait}`;
}

if (import.meta.main) {
  const { chromium } = await import("playwright");
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:5180";
  const prefixes = args.filter((a) => !a.startsWith("--"));
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    locale: "en-US",
    timezoneId: "UTC",
  });
  let differing = 0;
  let count = 0;
  for await (const path of new Glob("**/*.behaviour.json").scan(FIXTURES)) {
    const name = path.replace(/\.behaviour\.json$/, "");
    if (prefixes.length > 0 && !prefixes.some((p) => name.startsWith(p))) continue;
    const recording = (await Bun.file(join(FIXTURES, path)).json()) as Behaviour;
    const url = new URL(base);
    const fixture = name.split("@")[0]!;
    // The Builder's preview widths: a modal is 520px, a message and App Home 512px.
    const surface = (
      (await Bun.file(join(FIXTURES, `${fixture}.json`)).json()) as { type?: string }
    ).type;
    url.searchParams.set("render", fixture);
    url.searchParams.set("width", surface === "modal" ? "520" : "512");
    await page.goto(url.href, { waitUntil: "load" });
    await page.waitForSelector("#sbk-render > *");
    await page.mouse.move(1190, 890);
    count++;
    let lines: string[];
    try {
      lines = diffObservations(
        recording.steps,
        recording.observations,
        await replay(page, recording.steps),
      );
    } catch (err) {
      lines = [`replay failed: ${(err as Error).message.split("\n")[0]}`];
    }
    if (lines.length > 0) differing++;
    console.log(`${lines.length === 0 ? "  same " : "  DIFF "} ${name}`);
    for (const line of lines) console.log(`         ${line}`);
  }
  await browser.close();
  console.log(`\n${count} behaviour recordings, ${differing} behave differently`);
  if (args.includes("--check") && differing > 0) process.exit(1);
}
