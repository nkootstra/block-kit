// Gives the home page a machine-readable "last updated" date. Blume dates every other page in its
// JSON-LD (`dateModified`), but describes the home page only as the site and the product, and
// prints "Last updated on …" as plain text. Search engines then took the only date they could read,
// a preview message's `<time>`, as the page's date. This adds the date Blume already shows, from
// the page's git history:
// - a `WebPage` node with `dateModified` in the home page's JSON-LD;
// - a `<time datetime>` around the "Last updated on …" date.
// Remove this script once Blume does both itself; it fails the build when the markup it expects
// changes, so a Blume upgrade that adds them doesn't go unnoticed.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanProject } from "blume/core/project-graph.ts";

const root = resolve(import.meta.dir, "..");
const file = join(root, "dist", "index.html");

const { graph } = await scanProject(root, { mode: "build" });
const home = graph.pages.find((page) => page.route === "/");
if (!home?.lastModified) throw new Error("The home page has no last-modified date");
const modified = new Date(home.lastModified).toISOString();

let html = await readFile(file, "utf8");

const lastUpdated = /(>Last updated on )([^<]+)(<\/p>)/;
if (!lastUpdated.test(html)) {
  throw new Error(`No plain "Last updated on" date in ${file}; does Blume mark it up now?`);
}
html = html.replace(lastUpdated, `$1<time datetime="${modified}">$2</time>$3`);

const jsonLd = /(<script type="application\/ld\+json">)(.*?)(<\/script>)/s;
const [, open = "", json = "", close = ""] = html.match(jsonLd) ?? [];
const data = JSON.parse(json) as { "@graph": Record<string, unknown>[] };
const website = data["@graph"].find((node) => node["@type"] === "WebSite");
if (!website || data["@graph"].some((node) => "dateModified" in node)) {
  throw new Error(`Expected a WebSite node and no dateModified in the JSON-LD of ${file}`);
}
data["@graph"].push({
  "@id": `${website.url}/#page`,
  "@type": "WebPage",
  url: `${website.url}/`,
  name: home.title,
  isPartOf: { "@id": website["@id"] },
  dateModified: modified,
});
// Escaped like Blume's own, so no string in it can close the script element.
const escaped = JSON.stringify(data).replace(/</g, "\\u003c");
html = html.replace(jsonLd, () => `${open}${escaped}${close}`);

await writeFile(file, html);
console.log(`Dated the home page ${modified}`);
