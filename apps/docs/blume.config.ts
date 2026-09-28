import { defineConfig } from "blume";

export default defineConfig({
  title: "Block Kit for React",
  description: "Render Slack Block Kit JSON in React, pixel-for-pixel the way Slack does.",
  theme: { accent: "purple", radius: "md", mode: "system" },
  // Zoom would hijack clicks on images inside previews (emoji, image blocks).
  markdown: { imageZoom: false },
  github: { owner: "nkootstra", repo: "block-kit", dir: "apps/docs" },
  // Workers doesn't expose the site's URL at build time the way Pages did, so name it for the
  // sitemap, canonical links and Open Graph images.
  deployment: { site: "https://block-kit.kootstra.io" },
});
