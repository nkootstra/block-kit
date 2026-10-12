/**
 * How much of Slack's behaviour the references cover: for every fixture, which of the states it
 * should be compared in have a reference, and whether its interactions have a recorded payload.
 *
 *   bun tools/visual/src/coverage.ts
 *
 * Every fixture is expected in light, at the mobile width, in dark and at the mobile width in dark
 * (names.ts); the Builder's theme toggle and its Desktop/Mobile select are independent. App Home and
 * modal fixtures have no mobile width, since the Builder previews them only at desktop width. A
 * fixture with a control that opens (a select, time list, calendar or overflow menu) is also expected `@open`, in
 * both themes; one with a `confirm` `@confirm`; a section accessory multi-select `@dialog`. A
 * fixture with an interactive element is expected to have a payload recording
 * (`<fixture>@<interaction>.actions.json`). `@submit-errors` isn't expected: Block Kit Builder
 * doesn't validate a modal (it sends the view_submission with required fields empty and shows no
 * errors), so the reference would only show the modal as it was. A fixture with content that can be wider than the preview (a chart, a table,
 * a carousel) is expected in full at the mobile width and with its scroller scrolled to the end
 * (`@mobile+full`, `@scrolled-end+mobile`), or `@full` for a modal or App Home.
 *
 * Real-input states are counted on their own, so they don't drown the rest: every fixture is
 * expected `@hover-<kind>-1` and `@focus-<kind>-1` for the first control of each kind it has
 * (targets.ts), in light. Every behaviour probe (`.probe.json`) is expected to have its recording
 * (`.behaviour.json`).
 *
 * Prints the totals and what's missing, and writes
 * test-results/visual/coverage.json and coverage.md. It reports; it doesn't fail.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Glob } from "bun";
import { FIXTURES, readPayloads, readReferences } from "./lock";
import { KIND_OF_ELEMENT, KINDS } from "./targets";

export const OPENS =
  /^(multi_)?(static|external|users|conversations|channels)_select$|^(datepicker|timepicker|datetimepicker|overflow)$/;
/** Blocks whose content can be wider than the preview and scroll sideways. */
export const WIDE = /^(data_visualization|table|carousel)$/;
export const INTERACTIVE =
  /select$|^(button|overflow|datepicker|timepicker|datetimepicker|checkboxes|radio_buttons|workflow_button|feedback_buttons|icon_button|plain_text_input|number_input|email_text_input|url_text_input|rich_text_input|file_input)$/;

/** Every object in a payload, depth first, with the key it sits under (an array's items share it). */
export function* objects(
  value: unknown,
  parentKey?: string,
): Generator<[Record<string, unknown>, string | undefined]> {
  if (Array.isArray(value)) for (const v of value) yield* objects(v, parentKey);
  else if (value && typeof value === "object") {
    yield [value as Record<string, unknown>, parentKey];
    for (const [k, v] of Object.entries(value)) yield* objects(v, k);
  }
}

const elements = (payload: unknown) => [...objects(payload)];

/** The state suffixes a fixture should have a reference for, in a stable order. */
export function expectedStates(payload: unknown): string[] {
  const all = elements(payload);
  const type = (o: Record<string, unknown>) => (typeof o.type === "string" ? o.type : "");
  // The Builder disables its preview-size menu for App Home and modals: they render desktop only.
  const surface = (payload as { type?: unknown } | null)?.type;
  const states =
    surface === "home" || surface === "modal"
      ? ["", "@dark"]
      : ["", "@mobile", "@dark", "@mobile+dark"];
  if (all.some(([o]) => OPENS.test(type(o)))) states.push("@open", "@open+dark");
  if (all.some(([o]) => INTERACTIVE.test(type(o)) && "confirm" in o))
    states.push("@confirm", "@confirm+dark");
  if (all.some(([o, key]) => key === "accessory" && /^multi_.*select$/.test(type(o))))
    states.push("@dialog", "@dialog+dark");
  if (all.some(([o]) => WIDE.test(type(o))))
    states.push(
      ...(surface === "home" || surface === "modal"
        ? ["@full"]
        : ["@mobile+full", "@scrolled-end+mobile"]),
    );
  return states;
}

/** The real-input states a fixture should have: hover and focus on its first control of each kind. */
export function expectedInputStates(payload: unknown): string[] {
  const kinds = new Set(
    elements(payload).flatMap(([o]) =>
      typeof o.type === "string" && KIND_OF_ELEMENT[o.type] ? [KIND_OF_ELEMENT[o.type]!] : [],
    ),
  );
  if ((payload as { type?: unknown; submit?: unknown } | null)?.type === "modal") {
    if ((payload as { submit?: unknown }).submit) kinds.add("submit");
    if ((payload as { close?: unknown }).close) kinds.add("cancel");
  }
  return KINDS.filter((k) => kinds.has(k)).flatMap((k) => [`@hover-${k}-1`, `@focus-${k}-1`]);
}

const interactive = (payload: unknown) =>
  elements(payload).some(([o]) => typeof o.type === "string" && INTERACTIVE.test(o.type));

export interface Row {
  fixture: string;
  have: string[];
  missing: string[];
  /** Whether a payload recording exists; undefined when the fixture has nothing to interact with. */
  recording: boolean | undefined;
  /** The real-input states (expectedInputStates) it has and lacks. */
  input: { have: string[]; missing: string[] };
}

export function coverage(
  payloads: Map<string, unknown>,
  references: Set<string>,
  recordings: Set<string>,
  probes: { specs: Set<string>; recorded: Set<string> } = { specs: new Set(), recorded: new Set() },
): {
  rows: Row[];
  totals: {
    expected: number;
    captured: number;
    recordings: { expected: number; have: number };
    input: { expected: number; captured: number };
    behaviour: { expected: number; have: number; missing: string[] };
  };
} {
  const recorded = new Set([...recordings].map((r) => r.split("@")[0]));
  const rows = [...payloads.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fixture, payload]): Row => {
      const states = expectedStates(payload);
      const input = expectedInputStates(payload);
      return {
        fixture,
        have: states.filter((s) => references.has(fixture + s)),
        missing: states.filter((s) => !references.has(fixture + s)),
        recording: interactive(payload) ? recorded.has(fixture) : undefined,
        input: {
          have: input.filter((s) => references.has(fixture + s)),
          missing: input.filter((s) => !references.has(fixture + s)),
        },
      };
    });
  const withRecording = rows.filter((r) => r.recording !== undefined);
  return {
    rows,
    totals: {
      expected: rows.reduce((n, r) => n + r.have.length + r.missing.length, 0),
      captured: rows.reduce((n, r) => n + r.have.length, 0),
      recordings: {
        expected: withRecording.length,
        have: withRecording.filter((r) => r.recording).length,
      },
      input: {
        expected: rows.reduce((n, r) => n + r.input.have.length + r.input.missing.length, 0),
        captured: rows.reduce((n, r) => n + r.input.have.length, 0),
      },
      behaviour: {
        expected: probes.specs.size,
        have: [...probes.specs].filter((p) => probes.recorded.has(p)).length,
        missing: [...probes.specs].filter((p) => !probes.recorded.has(p)).sort(),
      },
    },
  };
}

/** The payload recordings under fixtures/, by name (`<fixture>@<interaction>`). */
export async function readRecordings(): Promise<Set<string>> {
  const recordings = new Set<string>();
  for await (const path of new Glob("**/*.actions.json").scan(FIXTURES))
    recordings.add(path.replace(/\.actions\.json$/, ""));
  return recordings;
}

/** The behaviour probes under fixtures/ and the ones with a recording, by `<fixture>@<probe>`. */
export async function readProbeRecordings(): Promise<{
  specs: Set<string>;
  recorded: Set<string>;
}> {
  const probes = { specs: new Set<string>(), recorded: new Set<string>() };
  for await (const path of new Glob("**/*.{probe,behaviour}.json").scan(FIXTURES)) {
    const [, name = "", kind] = /^(.*)\.(probe|behaviour)\.json$/.exec(path) ?? [];
    (kind === "probe" ? probes.specs : probes.recorded).add(name);
  }
  return probes;
}

if (import.meta.main) {
  const [payloads, references, recordings, probes] = await Promise.all([
    readPayloads(),
    readReferences(),
    readRecordings(),
    readProbeRecordings(),
  ]);
  const report = coverage(payloads, new Set(references.keys()), recordings, probes);
  const { totals } = report;
  const pct = (a: number, b: number) => `${b === 0 ? 100 : Math.round((a / b) * 1000) / 10}%`;
  const lines = [
    `References: ${totals.captured} of ${totals.expected} expected states (${pct(totals.captured, totals.expected)})`,
    `Payload recordings: ${totals.recordings.have} of ${totals.recordings.expected} interactive fixtures (${pct(totals.recordings.have, totals.recordings.expected)})`,
    `Real-input states (hover, focus): ${totals.input.captured} of ${totals.input.expected} (${pct(totals.input.captured, totals.input.expected)})`,
    `Behaviour recordings: ${totals.behaviour.have} of ${totals.behaviour.expected} probes (${pct(totals.behaviour.have, totals.behaviour.expected)})`,
  ];
  if (totals.behaviour.missing.length > 0)
    lines.push("", "Probes without a recording:", ...totals.behaviour.missing.map((p) => `  ${p}`));
  const byState = new Map<string, number>();
  for (const r of report.rows)
    for (const s of r.missing) byState.set(s || "light", (byState.get(s || "light") ?? 0) + 1);
  lines.push("", "Missing by state:", ...[...byState].map(([s, n]) => `  ${s}: ${n}`));
  const unrecorded = report.rows.filter((r) => r.recording === false).map((r) => r.fixture);
  lines.push(
    "",
    `Interactive fixtures without a payload recording (${unrecorded.length}):`,
    ...unrecorded.map((f) => `  ${f}`),
  );
  lines.push("", "Missing references per fixture:");
  for (const r of report.rows)
    if (r.missing.length > 0)
      lines.push(`  ${r.fixture}: ${r.missing.map((s) => s || "light").join(", ")}`);
  console.log(lines.join("\n"));
  const out = resolve(import.meta.dir, "../../../test-results/visual");
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "coverage.json"), JSON.stringify(report, null, 2));
  await writeFile(
    join(out, "coverage.md"),
    `# Visual coverage\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`,
  );
}
