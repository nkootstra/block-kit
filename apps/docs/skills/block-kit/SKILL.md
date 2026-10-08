---
name: block-kit
description: Render Slack Block Kit JSON in a React app with @nkootstra/block-kit, the way Slack shows it. Use when previewing Slack messages, modals or Home tabs in React, handling their button and input actions in the browser, or setting up the package's stylesheet, fonts, theming or server rendering.
---

# Block Kit for React

`@nkootstra/block-kit` renders the Block Kit JSON a Slack app sends (messages, modals and Home tabs)
as React components that look and behave the way they do in Slack. Full docs:
https://docs.block-kit.dev. Every page has a Markdown copy at the same path plus `.md`, and
https://docs.block-kit.dev/llms.txt lists them all. The docs' MCP server at
https://docs.block-kit.dev/mcp searches them and returns any page as Markdown.

## Install

Requires React 18 or later.

```sh
npm install @nkootstra/block-kit @fontsource/lato @fontsource/roboto-mono
```

Import the stylesheet and fonts once, near the root of the app:

```tsx
import "@nkootstra/block-kit/styles.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "@fontsource/roboto-mono/400.css";
```

The stylesheet resets and styles only elements inside the package's components, so global CSS
such as Tailwind's preflight doesn't change how blocks render. Skip the Fontsource packages if the
app already serves a font named `Lato`.

## Render a surface

Pass the same JSON the app sends to Slack:

| Component   | Renders                                      | Takes                               |
| ----------- | -------------------------------------------- | ----------------------------------- |
| `<Message>` | A message (`chat.postMessage`)               | `blocks`, or a whole message object |
| `<Modal>`   | A modal (`views.open`)                       | A `modal` view                      |
| `<HomeTab>` | The App Home tab (`views.publish`)           | A `home` view                       |
| `<View>`    | `<Modal>` or `<HomeTab>`, picked by its type | Any view                            |

```tsx
import { BlockKitProvider, Message } from "@nkootstra/block-kit";

export function Preview() {
  return (
    <BlockKitProvider>
      <Message
        app={{ name: "Deploy Bot" }}
        blocks={[{ type: "section", text: { type: "mrkdwn", text: "*Hello* :wave:" } }]}
      />
    </BlockKitProvider>
  );
}
```

## Handle actions

`onAction` on `<BlockKitProvider>` receives each action in the shape of one entry of a
`block_actions` payload's `actions` array, exactly as Slack sends it: echoed text objects carry
`emoji: true` (plain_text) or `verbatim: false` (mrkdwn). The second argument answers the way an app would:
`message.update` replaces the message (like `response_url` with `replace_original`), `views` opens,
pushes or updates modals, and `state` holds the current value of every input.

```tsx
import {
  BlockKitProvider,
  Message,
  type ActionContext,
  type BlockAction,
} from "@nkootstra/block-kit";

function handleAction(action: BlockAction, { message }: ActionContext) {
  if (action.action_id === "approve") {
    message?.update({
      blocks: [{ type: "section", text: { type: "mrkdwn", text: ":white_check_mark: Approved" } }],
    });
  }
}

<BlockKitProvider onAction={handleAction}>
  <Message blocks={blocks} />
</BlockKitProvider>;
```

Modal submissions arrive through `onSubmit`. To send interactions to a real Slack app's request URL
instead, see https://docs.block-kit.dev/guides/connecting-your-app.md.

## Mentions

`<@U123>`, `<#C123>` and `<!subteam^S123>` show raw ids, as Slack does for unknown ones, until you
pass `resolvers` to the provider. Each resolver is synchronous and returns a name or `undefined`:

```tsx
<BlockKitProvider
  resolvers={{
    user: (id) => users.get(id),
    channel: (id) => channels.get(id),
    usergroup: (id) => groups.get(id),
  }}
>
```

`slackFile: (file) => ({ url, size })` resolves a `slack_file` image (image block or element) to a
loadable URL and its size in bytes (shown as Slack's "(400 kB)", decimal kilobytes); an image block
draws a resolved file at most 400 x 400, as Slack does, and without a resolver shows its alt-text
placeholder.

`directory: (source) => entries` lists the people and channels a users, conversations or channels
select offers (`source` is `"users"`, `"conversations"` or `"channels"`), drawn as Slack's rows:
`{ type: "user", id, name, realName?, avatarUrl?, self?, badge?, bot?, presence? }` or
`{ type: "channel", id, name, private? }`. A conversations select
applies its `filter` to them.

`@nkootstra/block-kit/web-api` builds resolvers from the Slack Web API (needs `@slack/web-api`).

To link mentions to the app's own pages and route links through its router (full examples per
framework: https://docs.block-kit.dev/guides/linking-to-your-app.md):

- `mentionHref={({ type, id }) => url | undefined}`, `type` being `"user"`, `"channel"` or
  `"usergroup"`: channel and user group mentions become links; a user mention keeps opening its
  profile card, whose name links to the URL. Unresolved mentions stay unlinked.
- `linkComponent` renders every link from the payload (and linked mentions). It receives
  `LinkProps` (`href`, `className`, `children`, `target`, `rel`); pass `className` on.

```tsx
import { Link } from "react-router"; // TanStack: "@tanstack/react-router". Next.js: next/link, with href.
import type { LinkProps } from "@nkootstra/block-kit";

function AppLink({ href, className, target, rel, children }: LinkProps) {
  const props = { className, target, rel, children };
  return href.startsWith("/") ? <Link to={href} {...props} /> : <a href={href} {...props} />;
}
```

These props, and `resolvers`, are functions:

- **Next.js App Router:** put `<BlockKitProvider>` in a `"use client"` file and wrap the page in it;
  `<Message>` can still be imported into the Server Component. Passing a function from a Server
  Component fails with "Functions cannot be passed directly to Client Components".
- **Astro:** render your own React component that owns the provider as an island (`client:load`) and
  pass it only data. A function passed from `.astro` is silently dropped (the mentions render
  unlinked, no error).
- **React Router, TanStack Start, Vite:** pass them to the provider directly.

## Things that trip people up

- **Server rendering:** the main entry ships `"use client"`, so import components straight into a
  Next.js Server Component. Always pass `ts` (the message's Slack timestamp) to a server-rendered
  `<Message>`; without it the component stamps the current time and hydration mismatches.
- **Theme:** `theme="light" | "dark"` on the provider forces a colour scheme; otherwise the page's
  `data-theme` or the system preference applies. Colours are `--sbk-*` CSS custom properties,
  including callout backgrounds (`--sbk-callout-<color>-bg`), chart series colours
  (`--sbk-chart-1` to `-4`, and `-lift` for hover) and area chart fills (`--sbk-chart-area-1` to
  `-4`).
- **Hover menus on charts, images and tables** act in the page only, as in Slack, and never call
  `onAction`: a chart's View as table (a modal) and Download chart data (a `.tsv`), with Copy as
  image disabled; an image's Copy link and Hide image; a table's Copy table and Download table.
- **Unknown block types** render the block's `fallback` array in their place when it has one.

## Entry points

| Import                            | Contains                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `@nkootstra/block-kit`            | Components, the provider, hooks and payload builders      |
| `@nkootstra/block-kit/styles.css` | The stylesheet                                            |
| `@nkootstra/block-kit/mrkdwn`     | The mrkdwn parser, without React                          |
| `@nkootstra/block-kit/transport`  | Sends interactions to an app's request URL from a browser |
| `@nkootstra/block-kit/server`     | Signs and relays interactions from a server               |
| `@nkootstra/block-kit/web-api`    | Resolvers backed by the Slack Web API                     |

## Where to look next

- Every block: https://docs.block-kit.dev/blocks.md
- Every element: https://docs.block-kit.dev/elements.md
- Provider props: https://docs.block-kit.dev/reference/block-kit-provider.md
- Linking mentions and links into your app: https://docs.block-kit.dev/guides/linking-to-your-app.md
- Modals: https://docs.block-kit.dev/guides/modals.md
- Theming: https://docs.block-kit.dev/guides/theming.md
