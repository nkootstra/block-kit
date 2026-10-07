/**
 * How much of Slack's behaviour the references cover: for every fixture, which of the states it
 * should be compared in have a reference, and whether its interactions have a recorded payload.
 *
 *   bun tools/visual/src/coverage.ts
 *
 * Every fixture is expected in light, at the mobile width and in dark (names.ts); App Home and
 * modal fixtures have no mobile width, since the Builder previews them only at desktop width. A
 * fixture with a control that opens (a select, time list, calendar or overflow menu) is also expected `@open`, in
 * both themes; one with a `confirm` `@confirm`; a section accessory multi-select `@dialog`. A
 * fixture with an interactive element is expected to have a payload recording
 * (`<fixture>@<interaction>.actions.json`). Prints the totals and what's missing, and writes
 * test-results/visual/coverage.json and coverage.md. It reports; it doesn't fail.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Glob } from "bun";
import { FIXTURES, readPayloads, readReferences } from "./lock";

const OPENS =
  /^(multi_)?(static|external|users|conversations|channels)_select$|^(datepicker|timepicker|datetimepicker|overflow)$/;
const INTERACTIVE =
  /select$|^(button|overflow|datepicker|timepicker|datetimepicker|checkboxes|radio_buttons|workflow_button|feedback_buttons|icon_button|plain_text_input|number_input|email_text_input|url_text_input|rich_text_input|file_input)$/;

/** Every object in a payload, depth first. */
function* objects(
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
    surface === "home" || surface === "modal" ? ["", "@dark"] : ["", "@mobile", "@dark"];
  if (all.some(([o]) => OPENS.test(type(o)))) states.push("@open", "@open+dark");
  if (all.some(([o]) => INTERACTIVE.test(type(o)) && "confirm" in o))
    states.push("@confirm", "@confirm+dark");
  if (all.some(([o, key]) => key === "accessory" && /^multi_.*select$/.test(type(o))))
    states.push("@dialog", "@dialog+dark");
  return states;
}

const interactive = (payload: unknown) =>
  elements(payload).some(([o]) => typeof o.type === "string" && INTERACTIVE.test(o.type));

export interface Row {
  fixture: string;
  have: string[];
  missing: string[];
  /** Whether a payload recording exists; undefined when the fixture has nothing to interact with. */
  recording: boolean | undefined;
}

export function coverage(
  payloads: Map<string, unknown>,
  references: Set<string>,
  recordings: Set<string>,
): {
  rows: Row[];
  totals: {
    expected: number;
    captured: number;
    recordings: { expected: number; have: number };
  };
} {
  const recorded = new Set([...recordings].map((r) => r.split("@")[0]));
  const rows = [...payloads.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fixture, payload]): Row => {
      const states = expectedStates(payload);
      return {
        fixture,
        have: states.filter((s) => references.has(fixture + s)),
        missing: states.filter((s) => !references.has(fixture + s)),
        recording: interactive(payload) ? recorded.has(fixture) : undefined,
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
    },
  };
}

if (import.meta.main) {
  const [payloads, references] = await Promise.all([readPayloads(), readReferences()]);
  const recordings = new Set<string>();
  for await (const path of new Glob("**/*.actions.json").scan(FIXTURES))
    recordings.add(path.replace(/\.actions\.json$/, ""));
  const report = coverage(payloads, new Set(references.keys()), recordings);
  const { totals } = report;
  const pct = (a: number, b: number) => `${b === 0 ? 100 : Math.round((a / b) * 1000) / 10}%`;
  const lines = [
    `References: ${totals.captured} of ${totals.expected} expected states (${pct(totals.captured, totals.expected)})`,
    `Payload recordings: ${totals.recordings.have} of ${totals.recordings.expected} interactive fixtures (${pct(totals.recordings.have, totals.recordings.expected)})`,
  ];
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
