// `@pierre/diffs` imports the full `shiki` bundle, which ships a grammar for every language as its
// own chunk. The playground only ever highlights JSON, so vite.config.ts points `shiki` here: the
// same API, built from shiki's core with the JSON grammar alone.
import { createBundledHighlighter, createSingletonShorthands } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export * from "shiki/core";
export { createJavaScriptRegexEngine } from "shiki/engine/javascript";
export { createOnigurumaEngine } from "shiki/engine/oniguruma";

export const bundledLanguages = {
  json: () => import("shiki/langs/json.mjs"),
};

export const bundledThemes = {};

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
});

export const { codeToHtml } = createSingletonShorthands(createHighlighter);
