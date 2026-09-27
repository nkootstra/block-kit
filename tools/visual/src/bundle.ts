/**
 * Prints the fixtures as `{ fixtures: [{ name, payload }] }` JSON for the capture loop running in
 * Block Kit Builder:
 *
 *   bun tools/visual/src/bundle.ts | pbcopy
 */
import { resolve } from "node:path";
import { Glob } from "bun";

const FIXTURES = resolve(import.meta.dir, "../../../fixtures");
const only = process.argv.slice(2);

const fixtures: { name: string; payload: unknown }[] = [];
for await (const path of new Glob("**/*.json").scan(FIXTURES)) {
  const name = path.replace(/\.json$/, "");
  if (only.length > 0 && !only.some((prefix) => name.startsWith(prefix))) continue;
  const json = await Bun.file(`${FIXTURES}/${path}`).json();
  fixtures.push({ name, payload: Array.isArray(json) ? { blocks: json } : json });
}
fixtures.sort((a, b) => a.name.localeCompare(b.name));
process.stdout.write(JSON.stringify({ fixtures }));
