/** The page's words, shared by its <head>, its <h1> and the social card (pages/og.png.ts). */
/** What a search result shows: who it's for and what it does, in the 50-60 characters it has room for. */
export const title = "Slack Block Kit for React: render and preview Slack messages";
export const headline = "Slack Block Kit messages, rendered in React.";
export const description =
  "Render and preview Slack Block Kit messages, modals and Home tabs in React, the way Slack does, with working buttons and menus. Free and open source.";

/** The name Google shows above results; the docs and the playground use the same one. */
export const SITE_NAME = "Block Kit for React";

export const DOCS = "https://docs.block-kit.dev";
export const GITHUB = "https://github.com/nkootstra/block-kit";
export const NPM = "https://www.npmjs.com/package/@nkootstra/block-kit";
/** The playground: paste Block Kit JSON and see it rendered, in the browser. */
export const PLAYGROUND = "https://play.block-kit.dev";

const PACKAGES = "@nkootstra/block-kit @fontsource/lato @fontsource/roboto-mono";
/** The install command per package manager; npm first, as the one everyone has. */
export const INSTALL = [
  { manager: "npm", command: `npm install ${PACKAGES}` },
  { manager: "pnpm", command: `pnpm add ${PACKAGES}` },
  { manager: "yarn", command: `yarn add ${PACKAGES}` },
  { manager: "bun", command: `bun add ${PACKAGES}` },
];

/** Every block with a docs page, by its Block Kit `type`. */
export const BLOCKS = [
  "actions",
  "alert",
  "callout",
  "card",
  "carousel",
  "condition",
  "contact_card",
  "container",
  "context",
  "context_actions",
  "data_table",
  "data_visualization",
  "divider",
  "file",
  "header",
  "image",
  "input",
  "markdown",
  "plan",
  "rich_text",
  "section",
  "table",
  "task_card",
  "video",
];

/** A block's docs page. */
export const blockDocs = (type: string) => `${DOCS}/blocks/${type.replaceAll("_", "-")}`;
