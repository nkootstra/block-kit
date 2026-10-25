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
instead, see https://docs.block-kit.dev/guides/connecting-your-app.md: `httpTransport({ url, token? })`
in the browser, `createInteractionRelay({ requestUrl, signingSecret, token? })` on the server. The
relay is development and preview tooling (it signs whatever it's sent): keep the signing secret on
the server, set the same `token` on both whenever the route is reachable beyond the developer's
machine, and never deploy it in front of a production app.

**Rule: every payload the provider reports is built in the browser.** Server code that acts on one
verifies Slack's request signature, takes the acting user from its own session rather than the
payload, and checks each selected value, count and length against what it offered. Text from
users that goes into mrkdwn has `&`, `<` and `>` escaped. Details:
https://docs.block-kit.dev/guides/untrusted-input.md

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

A `rich_text` user mention with no `user` resolver shows Slack's grey loading bar (the lookup is
pending); with a `user` resolver that returns `undefined`, the user doesn't exist and it shows
Slack's empty outline instead, as a `contact_card` shows its "could not be displayed" notice.

Rich text elements that point at something only Slack can look up have no resolver: a
`workflow_mention`, `message_mention`, `file` or `canvas` shows Slack's pill for something the
viewer can't open ("Deleted workflow", "Private message", "Hidden file", "Private canvas"), whatever
its `text`; a `work_object_mention` and an `attachment_mention` show their `text` linked to `url`.

`slackFile: (file) => ({ url, size })` resolves a `slack_file` image (image block or element) to a
loadable URL and its size in bytes (shown as Slack's "(400 kB)", decimal kilobytes); an image block
draws a resolved file at most 400 x 400, as Slack does, and without a resolver shows its alt-text
placeholder.

`imageSize: (url) => bytes` gives an `image_url` image block's size for the same caption; Slack
shows the size of the image it downloaded, and block-kit doesn't download it, so without this the
caption is left out.

`directory: (source) => entries` lists the people and channels a users, conversations or channels
select offers (`source` is `"users"`, `"conversations"` or `"channels"`), drawn as Slack's rows:
`{ type: "user", id, name, realName?, avatarUrl?, self?, badge?, bot?, presence? }` or
`{ type: "channel", id, name, private? }`. A conversations select
applies its `filter` to them.

`@nkootstra/block-kit/web-api` builds resolvers (names and `userProfile`) from the Slack Web API.
The bot token never goes to the browser: on the server, `createResolverRelay({ client, token? })`
from `/server` answers lookups with a `WebClient`; in the browser, `useWebApiResolvers` gets
`httpResolverClient({ url })` from `/transport`, created once at module scope. Never construct a
`WebClient` in client code or give the token a `NEXT_PUBLIC_`/`VITE_` prefix.

**Rule: the Slack bot token (`xoxb-…`) and `@slack/web-api` only ever run on the server.** Never
generate code that creates a `WebClient` in a `"use client"` file, a React component, an Astro island
or anything a bundler ships to the browser. Resolver data reaches the browser one of two ways:
`httpResolverClient` asking a `createResolverRelay` route (development and preview tooling: set the
same `token` on both whenever the route is reachable beyond the developer's machine, and don't deploy
it publicly), or names resolved on the server and passed as plain `{ id: name }` maps.
`resolvers.slackFile` returns a URL on the app's own server that downloads the file with the token
(never `url_private`, never a token in a query string); `resolvers.directory` entries are fetched on
the server and passed as data. Scopes: `users:read`, `channels:read` (`groups:read` only for private
channels), `usergroups:read`, and `files:read` for files; never `users:read.email`. Working examples:
https://github.com/nkootstra/block-kit/tree/main/examples

To link mentions to the app's own pages and route links through its router (full examples per
framework: https://docs.block-kit.dev/guides/linking-to-your-app.md):

- `mentionHref={({ type, id }) => url | undefined}`, `type` being `"user"`, `"channel"` or
  `"usergroup"`: channel and user group mentions become links; a user mention keeps opening its
  profile card, whose name links to the URL. Unresolved mentions stay unlinked.
- `linkComponent` renders every link from the payload (and linked mentions). It receives
  `LinkProps` (`href`, `className`, `children`, `target`, `rel`); pass `className` on.
- Payload URLs are filtered: links, link buttons and overflow options only follow `http`, `https`,
  `mailto`, `slack` or relative URLs; `javascript:`, `data:` and other schemes render without an
  `href` and open nothing. `linkComponent` only gets URLs that passed, so don't re-add a check there,
  and never bypass it by rendering a payload URL into your own `<a>` or `window.open`.

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
  Downloaded files prefix a cell that would run as a spreadsheet formula with `'`. A data table
  cell that's cut off expands in place (Expand cell) the same way, without calling `onAction`, and
  a data table's Search filters its rows in the page.
- **Hover cards on links and unresolved mentions**, as in Slack, open on pointer hover only (not
  keyboard focus) and close on Escape. A mrkdwn or rich text link shows its URL with Open in new tab
  and Copy link buttons (the link sits in a `<span>` that takes the pointer events, so
  `linkComponent` needn't forward them); an unresolved channel mention says why its name is hidden.
- **Charts** are never narrower than 400px, as in Slack: in a narrower message the card scrolls
  sideways inside the block, its More actions button with it (the page doesn't scroll sideways).
  Hovering a bar, point or slice shows Slack's tooltip, which slides after the pointer and fades in
  and out.
- **Touch, reduced motion and high contrast:** hover styles apply only to a precise pointer (a
  mouse or trackpad); with reduced motion on, nothing slides or scales (fades stay); in forced
  colours (high contrast), focused controls get an outline the system paints. A desktop message
  looks the same either way. Details: https://docs.block-kit.dev/guides/theming.md
- **Unknown block types** render the block's `fallback` array in their place when it has one.

## Entry points

| Import                            | Contains                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| `@nkootstra/block-kit`            | Components, the provider, hooks and payload builders        |
| `@nkootstra/block-kit/styles.css` | The stylesheet                                              |
| `@nkootstra/block-kit/mrkdwn`     | The mrkdwn parser, without React                            |
| `@nkootstra/block-kit/transport`  | Browser-safe: interactions to the app, lookups to the relay |
| `@nkootstra/block-kit/server`     | Server only, dev tooling: interaction and resolver relays   |
| `@nkootstra/block-kit/web-api`    | Resolvers backed by the Slack Web API                       |

## Where to look next

- Every block: https://docs.block-kit.dev/blocks.md
- Every element: https://docs.block-kit.dev/elements.md
- Complete payloads for common messages, modals and Home tabs: https://docs.block-kit.dev/examples.md
- Slack's limits on blocks, elements and text, which the renderer doesn't enforce:
  https://docs.block-kit.dev/reference/limits.md
- A JSON editor with a live preview: https://docs.block-kit.dev/guides/block-kit-editor.md
- To show a user a payload rendered without writing code: the Block Kit playground at
  https://play.block-kit.dev renders pasted JSON as a message, modal or Home tab, and its links use
  Block Kit Builder's URL format
- Provider props: https://docs.block-kit.dev/reference/block-kit-provider.md
- Linking mentions and links into your app: https://docs.block-kit.dev/guides/linking-to-your-app.md
- Modals: https://docs.block-kit.dev/guides/modals.md
- Theming: https://docs.block-kit.dev/guides/theming.md
