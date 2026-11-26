// Renders the landing page's social card into apps/site/public/social/:
// - card.mp4: 2400x1260, 30fps, for og:video;
// - card.gif: 1200x630, 15fps, an animated og:image;
// - card.png: the first frame at 2400x1260 (the finished card), for twitter:image.
//
//   bun run render [--out=<dir>]
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const out = resolve(
  process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ??
    join(import.meta.dir, "../../../apps/site/public/social"),
);
await mkdir(out, { recursive: true });

const serveUrl = await bundle({ entryPoint: resolve(import.meta.dir, "index.ts") });
const composition = await selectComposition({ serveUrl, id: "og" });

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: 18,
  scale: 2,
  outputLocation: join(out, "card.mp4"),
});
await renderStill({ composition, serveUrl, frame: 0, scale: 2, output: join(out, "card.png") });
// Every other frame (15fps) at 1x keeps the GIF small enough for the platforms that animate it.
await renderMedia({
  composition,
  serveUrl,
  codec: "gif",
  everyNthFrame: 2,
  outputLocation: join(out, "card.gif"),
});
console.log(`Wrote card.mp4, card.png and card.gif to ${out}`);
