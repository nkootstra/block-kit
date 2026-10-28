/**
 * Records the baselines from the reports of a sharded comparison, as one full run of compare.ts
 * with --update-baseline would. CI compares main's fixtures in parallel slices, each writing its
 * results to report.json, and merges them here.
 *
 *   bun tools/visual/src/merge-baseline.ts --update-baseline[=lower] [--tolerance=0.1]
 *     [--platform=linux] <report.json>...
 *
 * Fails, writing nothing, unless the reports together hold exactly one result for every reference
 * (baseline.ts `mergeReports`), so a missing slice can't drop fixtures from the baselines.
 * --platform names the baselines to update (default: this machine's), which must be the platform
 * the slices ran on.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type Baseline,
  mergeReports,
  referenceNames,
  type Result,
  TOLERANCE,
  updateBaselines,
} from "./baseline";
import type { TextBaseline } from "./textRuns";

const ROOT = resolve(import.meta.dir, "../../..");
const FIXTURES = join(ROOT, "fixtures");

const args = process.argv.slice(2);
const updateBaseline = args.find((a) => /^--update-baseline(=lower)?$/.test(a));
if (!updateBaseline) throw new Error("pass --update-baseline or --update-baseline=lower");
const lowerOnly = updateBaseline === "--update-baseline=lower";
const tolerance = Number(args.find((a) => a.startsWith("--tolerance="))?.slice(12) ?? TOLERANCE);
const platform = args.find((a) => a.startsWith("--platform="))?.slice(11) ?? process.platform;
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) throw new Error("pass the slices' report.json files");

const reports: Result[][] = await Promise.all(files.map((file) => Bun.file(resolve(file)).json()));
const results = mergeReports(reports, await referenceNames(FIXTURES));

const BASELINE = join(FIXTURES, `visual-baseline.${platform}.json`);
const TEXT_BASELINE = join(FIXTURES, `text-baseline.${platform}.json`);
const read = async <T>(file: string, empty: T): Promise<T> =>
  existsSync(file) ? await Bun.file(file).json() : empty;
const next = updateBaselines(
  {
    visual: await read<Baseline>(BASELINE, {}),
    text: await read<TextBaseline>(TEXT_BASELINE, {}),
  },
  results,
  { full: true, lowerOnly, tolerance },
);
await writeFile(BASELINE, `${JSON.stringify(next.visual, null, 2)}\n`);
console.log(`baseline: ${BASELINE}`);
await writeFile(TEXT_BASELINE, `${JSON.stringify(next.text, null, 2)}\n`);
console.log(`text baseline: ${TEXT_BASELINE}`);
console.log(`${results.length} fixtures from ${files.length} reports`);
