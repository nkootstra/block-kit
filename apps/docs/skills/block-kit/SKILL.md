---
name: block-kit
description: Render Slack Block Kit JSON in a React app with @nkootstra/block-kit, the way Slack shows it. Use when previewing Slack messages, modals or Home tabs in React, handling their button and input actions in the browser, or setting up the package's stylesheet, fonts, theming or server rendering.
---

# Block Kit for React

`@nkootstra/block-kit` renders the Block Kit JSON a Slack app sends (messages, modals and Home tabs)
as React components that look and behave the way they do in Slack. Full docs:
https://block-kit.kootstra.io. Every page has a Markdown copy at the same path plus `.md`, and
https://block-kit.kootstra.io/llms.txt lists them all.

## Install

Requires React 19 or later.

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
`block_actions` payload's `actions` array. The second argument answers the way an app would:
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
instead, see https://block-kit.kootstra.io/guides/connecting-your-app.md.

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

`@nkootstra/block-kit/web-api` builds resolvers from the Slack Web API (needs `@slack/web-api`).

## Things that trip people up

- **Server rendering:** the main entry ships `"use client"`, so import components straight into a
  Next.js Server Component. Always pass `ts` (the message's Slack timestamp) to a server-rendered
  `<Message>`; without it the component stamps the current time and hydration mismatches.
- **Theme:** `theme="light" | "dark"` on the provider forces a colour scheme; otherwise the page's
  `data-theme` or the system preference applies. Colours are `--sbk-*` CSS custom properties.
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

- Every block: https://block-kit.kootstra.io/blocks.md
- Every element: https://block-kit.kootstra.io/elements.md
- Provider props: https://block-kit.kootstra.io/reference/block-kit-provider.md
- Modals: https://block-kit.kootstra.io/guides/modals.md
- Theming: https://block-kit.kootstra.io/guides/theming.md
