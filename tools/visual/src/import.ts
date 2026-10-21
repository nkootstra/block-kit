/**
 * Writes what a capture run in Block Kit Builder recorded (see snapshot.js, capture.js and
 * ../README.md) to fixtures/:
 *
 * - each reference to `<name>.reference.html`, recorded in references.lock.json;
 * - each Actions Preview payload to `<fixture>@<interaction>.actions.json`;
 * - each behaviour probe recording to `<fixture>@<probe>.behaviour.json`, and the last payload it
 *   saw, if any, to `<fixture>@<probe>.actions.json`.
 *
 * Everything is redacted on the way (normalize.ts, recordings.ts). Reads the file capture.js
 * downloaded, or JSON from stdin:
 *
 *   bun tools/visual/src/import.ts ~/Downloads/block-kit-refs-<session>.json
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
import {
  isRecordingName,
  lastAction,
  parseCaptureFile,
  recordingLeaks,
  redactBehaviour,
  redactor,
} from "./recordings";
import { readRedactions, sightings } from "./redact";

const source = process.argv[2];
const redactions = await readRedactions();
const capture = parseCaptureFile(
  JSON.parse(source ? await Bun.file(source).text() : await Bun.stdin.text()),
);
const [lock, payloads] = await Promise.all([readLock(), readPayloads()]);
const captured = new Date().toISOString().slice(0, 10);
// Who each member and channel is, by Slack ID, across the whole capture: a reference that shows
// only some of them, or a token without an ID, numbers them as the open lists do. Kept in memory.
const known = Object.values(capture.references).flatMap((html) => sightings(html, redactions));
let written = 0;
for (const [name, html] of Object.entries(capture.references)) {
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
  const normalized = normalize(html, redactions, known);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, normalized);
  lock[name] = { payload: hashPayload(payload), reference: sha256(normalized), captured };
  written++;
}
await writeLock(lock);
console.log(`wrote ${written} reference snapshots`);

/** Writes one recording, unless it still shows the Builder's workspace. */
async function writeRecording(name: string, kind: "actions" | "behaviour", value: unknown) {
  if (!isRecordingName(name)) {
    console.warn(`skipping ${kind} ${JSON.stringify(name)}: not <fixture>@<interaction>`);
    return false;
  }
  const fixture = payloads.get(payloadName(name));
  if (fixture === undefined) {
    console.warn(`skipping ${kind} ${name}: no fixture ${payloadName(name)}.json`);
    return false;
  }
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const leaked = recordingLeaks(json, fixture);
  if (leaked.length > 0) {
    console.warn(`skipping ${kind} ${name}: it still shows ${leaked.join(", ")}`);
    return false;
  }
  await writeFile(join(FIXTURES, `${name}.${kind}.json`), json);
  return true;
}

let actions = 0;
let behaviours = 0;
const toWrite = new Map(Object.entries(capture.actions));
for (const [name, recording] of Object.entries(capture.behaviour)) {
  const redact = redactor(payloads.get(payloadName(name)), redactions);
  if (await writeRecording(name, "behaviour", redactBehaviour(recording, redact))) behaviours++;
  const action = lastAction(recording);
  if (action && !toWrite.has(name)) toWrite.set(name, action);
}
for (const [name, payload] of toWrite) {
  const redact = redactor(payloads.get(payloadName(name)), redactions);
  if (await writeRecording(name, "actions", redact.payload(payload))) actions++;
}
if (actions + behaviours > 0)
  console.log(`wrote ${actions} payload recordings and ${behaviours} behaviour recordings`);
