/**
 * Writes reference snapshots captured in Block Kit Builder (see snapshot.js and ../README.md) to
 * fixtures/<name>.reference.html and records each in references.lock.json. Reads
 * `{ "<fixture name>": "<html>" }` JSON from stdin:
 *
 *   pbpaste | bun tools/visual/src/import.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  FIXTURES,
  hashPayload,
  payloadName,
  readLock,
  readPayloads,
  sha256,
  writeLock,
} from "./lock";
import { isReferenceName } from "./names";
import { normalize } from "./normalize";
import { readRedactions } from "./redact";

const redactions = await readRedactions();
const refs = JSON.parse(await Bun.stdin.text()) as Record<string, string>;
const [lock, payloads] = await Promise.all([readLock(), readPayloads()]);
const captured = new Date().toISOString().slice(0, 10);
let written = 0;
for (const [name, html] of Object.entries(refs)) {
  if (!isReferenceName(name)) {
    console.warn(`skipping invalid name ${JSON.stringify(name)}`);
    continue;
  }
  const payload = payloads.get(payloadName(name));
  if (payload === undefined) {
    console.warn(`skipping ${name}: no fixture ${payloadName(name)}.json`);
    continue;
  }
  const file = join(FIXTURES, `${name}.reference.html`);
  const normalized = normalize(html, redactions);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, normalized);
  lock[name] = { payload: hashPayload(payload), reference: sha256(normalized), captured };
  written++;
}
await writeLock(lock);
console.log(`wrote ${written} reference snapshots`);
