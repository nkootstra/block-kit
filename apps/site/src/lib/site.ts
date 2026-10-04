/** The page's words, shared by its <head>, its <h1> and the social card (pages/og.png.ts). */
/** What a search result shows: who it's for and what it does, in the 50-60 characters it has room for. */
export const title = "Slack Block Kit for React: render Slack messages anywhere";
export const headline = "Slack messages, rendered in React.";
export const description =
  "Render Slack Block Kit messages, modals and Home tabs in React, the way Slack does, with working buttons and menus.";

export const DOCS = "https://docs.block-kit.dev";
export const GITHUB = "https://github.com/nkootstra/block-kit";
export const NPM = "https://www.npmjs.com/package/@nkootstra/block-kit";

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
