/**
 * Prints the fixtures as `{ fixtures: [{ name, payload }], probes: [{ name, payload, probe }] }`
 * JSON for the capture loop running in Block Kit Builder. Each probe (probes.ts) is ready to pass to
 * capture.js as an item:
 *
 *   bun tools/visual/src/bundle.ts [prefix...] | pbcopy
 */
import { readPayloads } from "./lock";
import { readProbes } from "./probes";

const only = process.argv.slice(2);
const wanted = (name: string) =>
  only.length === 0 || only.some((prefix) => name.startsWith(prefix));
const asPayload = (json: unknown) => (Array.isArray(json) ? { blocks: json } : json);

const payloads = await readPayloads();
const fixtures: { name: string; payload: unknown }[] = [];
for (const [name, json] of payloads) {
  if (wanted(name)) fixtures.push({ name, payload: asPayload(json) });
}
fixtures.sort((a, b) => a.name.localeCompare(b.name));
const probes: { name: string; payload: unknown; probe: unknown }[] = [];
for (const [name, probe] of await readProbes()) {
  const json = payloads.get(name.split("@")[0]!);
  if (json !== undefined && wanted(name)) probes.push({ name, payload: asPayload(json), probe });
}
probes.sort((a, b) => a.name.localeCompare(b.name));
process.stdout.write(JSON.stringify({ fixtures, probes }));
