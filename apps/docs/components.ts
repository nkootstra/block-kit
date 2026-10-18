import { defineComponents } from "blume";

export default defineComponents({
  layout: {
    // Labels a release page's prev/next links "Newer release" and "Older release"; see
    // components/Pagination.astro.
    Pagination: "./components/Pagination.astro",
  },
  mdx: {
    // Renders the inline Markdown in descriptions and defaults; see components/TypeTable.astro.
    TypeTable: "./components/TypeTable.astro",
  },
});
