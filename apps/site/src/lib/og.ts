import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const require = createRequire(import.meta.url);

/** Satori reads TTF, OTF and WOFF, not WOFF2, so the card uses Fontsource's static WOFF files. */
const font = (file: string) => readFile(require.resolve(file));

/** A Satori element: React's shape without React. */
type Node = { type: string; props: Record<string, unknown> };
function el(type: string, style: Record<string, unknown>, children?: unknown, props = {}): Node {
  return { type, props: { style, children, ...props } };
}

/**
 * The 1200x630 social card: the logo, the page's headline and description, and a footer with the
 * install command and domain, in the site's fonts and colours, like a crop of the page.
 */
export async function renderCard({
  headline,
  description,
  logoSvg,
}: {
  headline: string;
  description: string;
  logoSvg: string;
}): Promise<Buffer> {
  const logo = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;
  const card = el(
    "div",
    {
      width: 1200,
      height: 630,
      display: "flex",
      flexDirection: "column",
      padding: "72px 80px 0",
      background: "#fff",
      color: "#0a0a0a",
      fontFamily: "Geist",
    },
    [
      el("div", { display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 600 }, [
        el("img", { width: 44, height: 44 }, undefined, { src: logo, width: 44, height: 44 }),
        "block-kit",
      ]),
      // Satori has no text-wrap: balance; this width breaks the headline after "messages,".
      el(
        "div",
        {
          marginTop: 72,
          maxWidth: 760,
          fontSize: 72,
          fontWeight: 600,
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
        },
        headline,
      ),
      el(
        "div",
        { marginTop: 28, maxWidth: 940, fontSize: 29, lineHeight: 1.4, color: "#404040" },
        description,
      ),
      el(
        "div",
        {
          marginTop: "auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "28px 0 36px",
          borderTop: "1px solid #e5e5e5",
          fontFamily: "Geist Mono",
          fontSize: 22,
          color: "#6b6b6b",
        },
        [el("span", {}, "npm install @nkootstra/block-kit"), el("span", {}, "block-kit.dev")],
      ),
    ],
  );

  const svg = await satori(card as never, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Geist",
        data: await font("@fontsource/geist/files/geist-latin-400-normal.woff"),
        weight: 400,
      },
      {
        name: "Geist",
        data: await font("@fontsource/geist/files/geist-latin-600-normal.woff"),
        weight: 600,
      },
      {
        name: "Geist Mono",
        data: await font("@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff"),
        weight: 400,
      },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
