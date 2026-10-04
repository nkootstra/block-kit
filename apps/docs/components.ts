import { defineComponents } from "blume";

export default defineComponents({
  mdx: {
    // Renders the inline Markdown in descriptions and defaults; see components/TypeTable.astro.
    TypeTable: "./components/TypeTable.astro",
  },
});
