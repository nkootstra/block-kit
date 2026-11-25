import { readdir, readFile } from "node:fs/promises";
import react from "@astrojs/react";
import { cspProblems, inlineScriptHashes } from "@block-kit/csp";
import { defineConfig, fontProviders } from "astro/config";

/**
 * Fails the build when a built page has an inline script that the Content-Security-Policy in the
 * `_headers` it ships doesn't allow by hash, or the policy allows a hash no page needs, so a deploy
 * never blocks its own scripts. Astro writes some of those scripts itself (the island loader), so
 * an Astro upgrade can change them too.
 */
const checkCsp = {
  name: "check-csp",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const pages = (await readdir(dir)).filter((file) => file.endsWith(".html"));
      const html = (
        await Promise.all(pages.map((page) => readFile(new URL(page, dir), "utf8")))
      ).join("\n");
      const problems = cspProblems(html, await readFile(new URL("_headers", dir), "utf8"));
      if (problems.length > 0) {
        throw new Error(
          `public/_headers doesn't match the built pages:\n${problems.join("\n")}\n` +
            `script-src should list 'self' ${[...new Set(inlineScriptHashes(html))].join(" ")}`,
        );
      }
    },
  },
};

/** Latin-only files from the installed Fontsource packages: everything on the page is English. */
const lato = (weight, style) => ({
  weight,
  style,
  src: [`@fontsource/lato/files/lato-latin-${weight}-${style}.woff2`],
});

// Astro serves and preloads these, and generates a fallback face per family with matching metrics,
// so text doesn't shift when the fonts arrive.
export default defineConfig({
  site: "https://block-kit.dev",
  integrations: [react(), checkCsp],
  vite: {
    // The package is linked from the workspace, so Vite serves it as source and only finds the
    // dependencies its build imports (mdast, micromark) once a page loads them. It then re-bundles
    // and the islands already loading fail ("Outdated Optimize Dep"). Pre-bundling the package
    // itself, dependencies included, settles that at startup.
    optimizeDeps: {
      include: ["@nkootstra/block-kit"],
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Geist",
      cssVariable: "--font-geist",
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
      options: {
        variants: [
          {
            weight: "100 900",
            style: "normal",
            src: ["@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Geist Mono",
      cssVariable: "--font-geist-mono",
      fallbacks: ["ui-monospace", "monospace"],
      options: {
        variants: [
          {
            weight: "100 900",
            style: "normal",
            src: ["@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"],
          },
        ],
      },
    },
    {
      // The messages' font, as the package's stylesheet expects it (`--sbk-font`).
      provider: fontProviders.local(),
      name: "Lato",
      cssVariable: "--font-lato",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          lato(400, "normal"),
          lato(400, "italic"),
          lato(700, "normal"),
          lato(700, "italic"),
          lato(900, "normal"),
        ],
      },
    },
  ],
});
