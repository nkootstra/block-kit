import { defineConfig } from "blume";
import { filesystem, githubReleases } from "blume/sources";

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
  // Each GitHub release becomes a page under /changelog, listed newest first at /changelog with an
  // RSS feed. The notes come from the release's PR titles; set GITHUB_TOKEN to avoid GitHub's
  // anonymous rate limit.
  content: {
    sources: [
      filesystem(),
      githubReleases({ prefix: "changelog", owner: "nkootstra", repo: "block-kit" }),
    ],
  },
  changelog: {
    title: "Changelog",
    description:
      "What changed in each release of @nkootstra/block-kit, the React renderer for Slack Block Kit, newest first, with the pull requests behind each change.",
  },
  // A tab owns the section under its path, so the release pages stay out of the docs sidebar (and
  // out of the last docs page's "next" link) while /changelog, its RSS feed, llms.txt, the sitemap
  // and search still list every release (https://github.com/haydenbleasel/blume/issues/336).
  navigation: {
    tabs: [
      { label: "Docs", path: "/" },
      { label: "Changelog", path: "/changelog" },
    ],
  },
  // Publishes skills/*/SKILL.md for agents at /.well-known/agent-skills/.
  agents: { skills: "./skills" },
  // Tells search engines and agents what the site documents: a free, MIT-licensed library.
  seo: {
    // Cited as the publisher of the site and of every page in their JSON-LD.
    organization: {
      name: "Niels Kootstra",
      url: "https://github.com/nkootstra",
      logo: "/icon.svg",
      sameAs: ["https://github.com/nkootstra"],
    },
    software: {
      license: "MIT",
      price: 0,
      sameAs: [
        "https://www.npmjs.com/package/@nkootstra/block-kit",
        "https://github.com/nkootstra/block-kit",
      ],
    },
  },
  github: { owner: "nkootstra", repo: "block-kit", dir: "apps/docs" },
  // Workers doesn't expose the site's URL at build time the way Pages did, so name it for the
  // sitemap, canonical links and Open Graph images.
  deployment: { site: "https://docs.block-kit.dev" },
});
