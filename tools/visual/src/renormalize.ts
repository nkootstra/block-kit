/**
 * Re-applies normalize.ts to every committed reference, after a new rule is added:
 *
 *   bun tools/visual/src/renormalize.ts
 *
 * Moves each rewritten reference's hash in references.lock.json along, but only for a reference
 * that still matched its lock entry, so a hand edit can't ride along with a normalize rule.
 */
import { join } from "node:path";
import { FIXTURES, readLock, readReferences, sha256, writeLock } from "./lock";
import { normalize } from "./normalize";
import { readRedactions } from "./redact";

const redactions = await readRedactions();
const lock = await readLock();
let changed = 0;
for (const [name, html] of await readReferences()) {
  const next = normalize(html, redactions);
  if (next === html) continue;
  await Bun.write(join(FIXTURES, `${name}.reference.html`), next);
  const entry = lock[name];
  if (entry?.reference === sha256(html)) entry.reference = sha256(next);
  else console.warn(`  ${name} didn't match references.lock.json; its entry is left as is`);
  console.log(`normalized ${name}`);
  changed++;
}
await writeLock(lock);
console.log(`${changed} reference(s) changed`);
