/**
 * What a comparison records in the baselines (fixtures/visual-baseline.<platform>.json and
 * fixtures/text-baseline.<platform>.json), shared by compare.ts, which updates them from the
 * fixtures it ran, and merge-baseline.ts, which updates them from the reports of a sharded run.
 */
import { Glob } from "bun";
import { parseReferenceName } from "./names";
import { type TextBaseline, type TextRunReport, updateTextBaseline } from "./textRuns";

export interface Result {
  name: string;
  reference: { width: number; height: number };
  actual: { width: number; height: number };
  mismatch: number;
  ratio: number;
  /** Set when our side failed to render; the fixture then counts as a 100% mismatch. */
  error?: string;
  /** The text-run comparison; absent when our side failed to render. */
  text?: TextRunReport;
  /** Where our controls' state styles differ from Slack's (stateStyles.ts); reported only. */
  stateStyles?: string[];
  /** Where our scroll containers differ from Slack's (scrollers.ts); reported only. */
  scrollers?: string[];
}

/** Each fixture's mismatch in percent, rounded to two decimals. */
export type Baseline = Record<string, number>;

export interface Baselines {
  visual: Baseline;
  text: TextBaseline;
}

/** Every reference's name (`<fixture>[@state][+variant]`), sorted. */
export async function referenceNames(fixtures: string): Promise<string[]> {
  const names: string[] = [];
  for await (const path of new Glob("**/*.reference.html").scan(fixtures)) {
    names.push(path.replace(/\.reference\.html$/, ""));
  }
  return names.toSorted();
}

export const percent = (r: Result) => Math.round(r.ratio * 10_000) / 100;

/**
 * Whether a reference's pixel mismatch counts: recorded in the visual baseline, checked against it
 * and in the mean. A submitted modal's doesn't: Block Kit Builder doesn't validate a modal, so its
 * reference shows none of the errors we draw, and only its text findings are recorded.
 */
export const scoresPixels = (name: string) =>
  parseReferenceName(name).interaction !== "submit-errors";

/** The text-run findings of every fixture that rendered. */
export const textFindingsOf = (results: readonly Result[]): TextBaseline =>
  Object.fromEntries(results.flatMap((r) => (r.text ? [[r.name, r.text.findings] as const] : [])));

/**
 * How far, in percentage points, a fixture's mismatch may move before it counts as a regression or
 * an improvement. Linux CI renders the same commit identically from run to run, so this only leaves
 * room for the odd anti-aliased pixel.
 */
export const TOLERANCE = 0.1;

/**
 * The baselines after a run. A full run (every fixture) rewrites them, dropping removed fixtures; a
 * partial one only updates the fixtures it ran. `lowerOnly` keeps every recorded entry unless it
 * improved beyond the tolerance, and adds new fixtures, so it can't hide a regression. A fixture
 * that failed to render keeps its entry, or loses it in a full rewrite.
 */
export function updateBaselines(
  before: Baselines,
  results: readonly Result[],
  { full, lowerOnly, tolerance }: { full: boolean; lowerOnly: boolean; tolerance: number },
): Baselines {
  const next = full && !lowerOnly ? {} : { ...before.visual };
  for (const r of results) {
    if (r.error) continue;
    if (!scoresPixels(r.name)) {
      delete next[r.name];
      continue;
    }
    const previous = before.visual[r.name];
    if (lowerOnly && previous !== undefined && percent(r) >= previous - tolerance) continue;
    next[r.name] = percent(r);
  }
  return {
    visual: Object.fromEntries(Object.entries(next).toSorted(([a], [b]) => a.localeCompare(b))),
    text: updateTextBaseline(before.text, textFindingsOf(results), { full, lowerOnly }),
  };
}

/**
 * The results of a sharded run's slices, as one full run's. Throws unless they cover every
 * reference exactly once: a slice that is missing, or ran another commit's fixtures, would
 * otherwise drop fixtures from a full rewrite of the baselines.
 */
export function mergeReports(
  reports: readonly Result[][],
  references: readonly string[],
): Result[] {
  const merged = reports.flat();
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const r of merged) (seen.has(r.name) ? duplicated : seen).add(r.name);
  const expected = new Set(references);
  const missing = references.filter((name) => !seen.has(name));
  const unknown = [...seen].filter((name) => !expected.has(name));
  const problems = [
    ...(missing.length > 0 ? [`no result for ${missing.length}: ${list(missing)}`] : []),
    ...(unknown.length > 0 ? [`results without a reference: ${list(unknown)}`] : []),
    ...(duplicated.size > 0 ? [`more than one result: ${list([...duplicated])}`] : []),
  ];
  if (problems.length > 0) {
    throw new Error(
      `The reports don't cover the references once each:\n  ${problems.join("\n  ")}`,
    );
  }
  return merged.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const list = (names: readonly string[]) =>
  names.length > 10
    ? `${names.slice(0, 10).join(", ")} and ${names.length - 10} more`
    : names.join(", ");
