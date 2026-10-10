import {
  BLOCKS,
  blockDocs,
  DOCS,
  GITHUB,
  INSTALL,
  NPM,
  PLAYGROUND,
  description,
  title,
} from "./site";

/**
 * The home page as Markdown, for agents that ask for it (`Accept: text/markdown`): the same
 * words as the page, without its demos and chrome. Served from `/index.md` by worker/index.ts.
 */
export function homeMarkdown(): string {
  return `# ${title}

${description}

\`@nkootstra/block-kit\` takes the Block Kit JSON your Slack app sends (to \`chat.postMessage\` or \`views.open\`) and draws the message, modal or Home tab the way Slack does, with the same spacing, fonts and colours. Buttons and menus work, and hand you the payloads Slack would.

Block Kit Builder only runs inside Slack. This is for everywhere else: an admin panel, a template gallery, an approval queue, a test harness for your bot.

## Install

React 18 or later.

${INSTALL.map(({ manager, command }) => `- ${manager}: \`${command}\``).join("\n")}

## Render a message

\`\`\`tsx
import "@nkootstra/block-kit/styles.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import { BlockKitProvider, Message } from "@nkootstra/block-kit";

export function App() {
  return (
    <BlockKitProvider>
      <Message
        blocks={[
          { type: "section", text: { type: "mrkdwn", text: "*Hello* from Block Kit :wave:" } },
        ]}
      />
    </BlockKitProvider>
  );
}
\`\`\`

The [quickstart](${DOCS}/quickstart) wires up an interactive approval message. To try it without installing anything, paste your JSON into the [Block Kit playground](${PLAYGROUND}).

## Buttons that work

Buttons, menus, pickers and inputs work. \`onPayload\` receives the \`block_actions\` payload Slack would send your app, and a signed relay can forward it to your Bolt app.

## Checked against Slack

Each block is checked, pixel by pixel, against a capture of Slack's own rendering.

## Blocks

${BLOCKS.map((type) => `- [\`${type}\`](${blockDocs(type)})`).join("\n")}

## Links

- [Documentation](${DOCS})
- [Docs for agents](${DOCS}/llms.txt)
- [Block Kit playground](${PLAYGROUND}): paste Block Kit JSON and see it rendered, no sign-in
- [npm](${NPM})
- [GitHub](${GITHUB})
- [Changelog](${DOCS}/changelog)
`;
}

/** The 404 body for agents that ask for Markdown. */
export function notFoundMarkdown(): string {
  return `# Page not found

There's no page at this address on block-kit.dev. The site is a single page; the documentation lives at ${DOCS}.

- [Home](https://block-kit.dev/)
- [Documentation](${DOCS})
- [llms.txt](https://block-kit.dev/llms.txt)
- [Sitemap](https://block-kit.dev/sitemap.xml)
`;
}

/** The 404 body for agents that ask for JSON: an RFC 9457 problem document. */
export function notFoundProblem() {
  return {
    type: "about:blank",
    title: "Not Found",
    status: 404,
    code: "PAGE_NOT_FOUND",
    detail: "There's no page at this address on block-kit.dev.",
    hint: `The site is a single page at https://block-kit.dev/. For the documentation, see ${DOCS} or ${DOCS}/llms.txt.`,
  };
}
