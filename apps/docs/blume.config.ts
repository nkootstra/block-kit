import { defineConfig } from "blume";
import { cloudflare } from "blume/deploy";

export default defineConfig({
  title: "Block Kit for React",
  description: "Render Slack Block Kit JSON in React, pixel-for-pixel the way Slack does.",
  theme: { accent: "purple", radius: "md", mode: "system" },
  // Zoom would hijack clicks on images inside previews (emoji, image blocks).
  markdown: { imageZoom: false },
  // Without an analytics adapter the "Was this page helpful?" answers aren't recorded anywhere.
  feedback: false,
  // Dates each page from its last commit; CI checks out the full history for it.
  lastModified: "git",
  // Publishes skills/*/SKILL.md for agents at /.well-known/agent-skills/.
  agents: { skills: "./skills" },
  github: { owner: "nkootstra", repo: "block-kit", dir: "apps/docs" },
  // A Cloudflare server build puts Blume's Worker in front of the pages, so a request with
  // `Accept: text/markdown` gets the page's Markdown at the same URL. Workers doesn't expose the
  // site's URL at build time the way Pages did, so name it for the sitemap, canonical links and
  // Open Graph images.
  deployment: cloudflare({ site: "https://block-kit.kootstra.io" }),
});
