/**
 * Writes reference snapshots captured in Block Kit Builder (see snapshot.js and ../README.md) to
 * fixtures/<name>.reference.html. Reads `{ "<fixture name>": "<html>" }` JSON from stdin:
 *
 *   pbpaste | bun tools/visual/src/import.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { normalize } from "./normalize";

const FIXTURES = resolve(import.meta.dir, "../../../fixtures");

const refs = JSON.parse(await Bun.stdin.text()) as Record<string, string>;
let written = 0;
for (const [name, html] of Object.entries(refs)) {
  if (!/^[a-z0-9/_-]+(@[a-z0-9-]+)?$/.test(name) || name.includes("..")) {
    console.warn(`skipping invalid name ${JSON.stringify(name)}`);
    continue;
  }
  const file = join(FIXTURES, `${name}.reference.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, normalize(html));
  written++;
}
console.log(`wrote ${written} reference snapshots`);
