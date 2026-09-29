/**
 * Prints the fixtures as `{ fixtures: [{ name, payload }] }` JSON for the capture loop running in
 * Block Kit Builder:
 *
 *   bun tools/visual/src/bundle.ts | pbcopy
 */
import { readPayloads } from "./lock";

const only = process.argv.slice(2);

const fixtures: { name: string; payload: unknown }[] = [];
for (const [name, json] of await readPayloads()) {
  if (only.length > 0 && !only.some((prefix) => name.startsWith(prefix))) continue;
  fixtures.push({ name, payload: Array.isArray(json) ? { blocks: json } : json });
}
fixtures.sort((a, b) => a.name.localeCompare(b.name));
process.stdout.write(JSON.stringify({ fixtures }));
