/**
 * Re-applies normalize.ts to every committed reference, after a new rule is added:
 *
 *   bun tools/visual/src/renormalize.ts
 */
import { join, resolve } from "node:path";
import { Glob } from "bun";
import { normalize } from "./normalize";

const FIXTURES = resolve(import.meta.dir, "../../../fixtures");
let changed = 0;
for await (const path of new Glob("**/*.reference.html").scan(FIXTURES)) {
  const file = join(FIXTURES, path);
  const html = await Bun.file(file).text();
  const next = normalize(html);
  if (next === html) continue;
  await Bun.write(file, next);
  console.log(`normalized ${path}`);
  changed++;
}
console.log(`${changed} reference(s) changed`);
