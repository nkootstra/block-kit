/**
 * Renders every fixture with two builds of the library, in light and dark, and keeps the renders
 * that differ: how a pull request changes what users see.
 *
 *   bun tools/visual/src/render/render-diff.ts --base=<packages/block-kit of the base checkout>
 *     [--head=<packages/block-kit, default this checkout's>] [--out=test-results/render-diff]
 *     [fixture-prefix...]
 *
 * The fixtures always come from this checkout, so both builds render the same payloads. For each
 * changed fixture and theme it writes `<fixture>.<theme>.{before,after,diff}.png`; manifest.json
 * lists them, plus the renders that failed.
 */
import { isFixturePayload } from "../lock";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Glob } from "bun";
import { diffPngs } from "./diff";
import { createRenderer, type Theme } from "./renderer";

const ROOT = resolve(import.meta.dir, "../../../..");
const FIXTURES = join(ROOT, "fixtures");
const THEMES: Theme[] = ["light", "dark"];

export interface Manifest {
  /** Fixture × theme pairs rendered with both builds. */
  rendered: number;
  changed: { fixture: string; theme: Theme; changedPixels: number }[];
  failed: { fixture: string; theme: Theme; error: string }[];
}

export async function renderDiff(options: {
  base: string;
  head: string;
  out: string;
  only?: string[];
}): Promise<Manifest> {
  const fixtures = await listFixtures(options.only ?? []);
  const [before, after] = await Promise.all([
    createRenderer(options.base),
    createRenderer(options.head),
  ]);
  const manifest: Manifest = { rendered: 0, changed: [], failed: [] };
  try {
    for (const fixture of fixtures) {
      const json = await Bun.file(join(FIXTURES, `${fixture}.json`)).text();
      for (const theme of THEMES) {
        let pngs: [Buffer, Buffer];
        try {
          pngs = await Promise.all([before.render(json, theme), after.render(json, theme)]);
        } catch (err) {
          manifest.failed.push({
            fixture,
            theme,
            error: (err as Error).message.split("\n")[0] ?? "",
          });
          continue;
        }
        manifest.rendered++;
        const { image, changedPixels } = diffPngs(...pngs);
        if (changedPixels === 0) continue;
        manifest.changed.push({ fixture, theme, changedPixels });
        const file = join(options.out, `${fixture}.${theme}`);
        await mkdir(dirname(file), { recursive: true });
        await Promise.all([
          writeFile(`${file}.before.png`, pngs[0]),
          writeFile(`${file}.after.png`, pngs[1]),
          writeFile(`${file}.diff.png`, image),
        ]);
      }
    }
  } finally {
    await Promise.all([before.close(), after.close()]);
  }
  await mkdir(options.out, { recursive: true });
  await writeFile(join(options.out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function listFixtures(prefixes: string[]): Promise<string[]> {
  const names: string[] = [];
  for await (const path of new Glob("**/*.json").scan(FIXTURES)) {
    if (!isFixturePayload(path)) continue;
    const name = path.replace(/\.json$/, "");
    if (prefixes.length === 0 || prefixes.some((p) => name.startsWith(p))) names.push(name);
  }
  return names.toSorted();
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const base = option("base");
  if (!base) {
    console.error(
      "Usage: render-diff.ts --base=<packages/block-kit> [--head=…] [--out=…] [prefix…]",
    );
    process.exit(1);
  }
  const manifest = await renderDiff({
    base: resolve(base),
    head: resolve(option("head") ?? join(ROOT, "packages/block-kit")),
    out: resolve(option("out") ?? join(ROOT, "test-results/render-diff")),
    only: args.filter((a) => !a.startsWith("--")),
  });
  console.log(
    `${manifest.rendered} renders, ${manifest.changed.length} changed, ${manifest.failed.length} failed`,
  );
  for (const c of manifest.changed)
    console.log(`  changed ${c.fixture} (${c.theme}): ${c.changedPixels} px`);
  for (const f of manifest.failed) console.log(`  failed  ${f.fixture} (${f.theme}): ${f.error}`);
}
