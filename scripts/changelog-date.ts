/**
 * Dates the docs' /changelog page with the newest release. Blume dates every page from its last
 * commit, and the changelog page's own text rarely changes while the releases it lists do, so its
 * "Last updated" footer and sitemap <lastmod> fell weeks behind (docs audit, 2026-11-21). A page's
 * `lastModified` frontmatter wins over the commit date, so CI writes the newest release's date
 * there before it builds the docs for a deploy. Nothing is committed.
 *
 *   bun scripts/changelog-date.ts
 */
import { $ } from "bun";
import { join } from "node:path";

const PAGE = join(import.meta.dir, "../apps/docs/docs/changelog/index.mdx");
const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** The page with `lastModified: <date>` in its frontmatter, replacing one already there. */
export function stampLastModified(page: string, date: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(page);
  if (!match) throw new Error("the changelog page has no frontmatter to date");
  const fields = match[1]!.split("\n").filter((line) => !line.startsWith("lastModified:"));
  return `---\n${[...fields, `lastModified: ${date}`].join("\n")}\n---\n${page.slice(match[0].length)}`;
}

/** The highest `vX.Y.Z` among `<tag> <ISO date>` lines, with its date in UTC. */
export function newestRelease(lines: string[]): { tag: string; date: string } | undefined {
  const releases = lines
    .map((line) => line.trim().split(" "))
    .flatMap(([tag = "", iso = ""]) => {
      const version = RELEASE.exec(tag);
      return version ? [{ tag, iso, version: version.slice(1).map(Number) }] : [];
    })
    .toSorted((a, b) => {
      for (let i = 0; i < 3; i++)
        if (a.version[i] !== b.version[i]) return b.version[i]! - a.version[i]!;
      return 0;
    });
  const newest = releases[0];
  return newest && { tag: newest.tag, date: new Date(newest.iso).toISOString().slice(0, 10) };
}

if (import.meta.main) {
  const format = "%(refname:short) %(creatordate:iso-strict)";
  const pattern = "refs/tags/v*";
  const tags = await $`git for-each-ref --format=${format} ${pattern}`.text();
  const newest = newestRelease(tags.split("\n").filter(Boolean));
  if (!newest) {
    console.log("No release tags; the changelog page keeps its commit date.");
  } else {
    await Bun.write(PAGE, stampLastModified(await Bun.file(PAGE).text(), newest.date));
    console.log(`Dated the changelog page ${newest.date}, from ${newest.tag}.`);
  }
}
