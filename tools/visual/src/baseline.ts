/**
 * What a comparison records in the baselines (fixtures/visual-baseline.<platform>.json and
 * fixtures/text-baseline.<platform>.json), shared by compare.ts, which updates them from the
 * fixtures it ran, and merge-baseline.ts, which updates them from the reports of a sharded run.
 */
import { Glob } from "bun";
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

/** The text-run findings of every fixture that rendered. */
export const textFindingsOf = (results: readonly Result[]): TextBaseline =>
  Object.fromEntries(results.flatMap((r) => (r.text ? [[r.name, r.text.findings] as const] : [])));

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
    const previous = before.visual[r.name];
    if (lowerOnly && previous !== undefined && percent(r) >= previous - tolerance) continue;
    next[r.name] = percent(r);
  }
  return {
    visual: Object.fromEntries(Object.entries(next).toSorted(([a], [b]) => a.localeCompare(b))),
    text: updateTextBaseline(before.text, textFindingsOf(results), { full, lowerOnly }),
  };
}
