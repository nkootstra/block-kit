# Block Kit for React

`@nkootstra/block-kit` renders Slack [Block Kit](https://docs.slack.dev/block-kit/) JSON in React, pixel-for-pixel the way Slack does. Pass it the `blocks` your app sends to `chat.postMessage` or `views.open` and it draws the message, modal or Home tab, with working buttons, menus, date pickers and inputs.

Documentation: **<https://docs.block-kit.dev>**

To try it without installing anything, paste your JSON (`{ "blocks": [...] }`, a `chat.postMessage` body, a view, or a `views.open` or `views.publish` body) into the [Block Kit playground](https://play.block-kit.dev): it renders the message, modal or Home tab with this package and shows the payload each click sends. No Slack sign-in.

## Install

The package needs React 18 or 19.

```sh
bun add @nkootstra/block-kit @fontsource/lato @fontsource/roboto-mono
```

Import the stylesheet and fonts once, near the root of your app (`src/main.tsx` in Vite, `app/layout.tsx` in the Next.js App Router), then render a message:

```tsx
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
```

The [installation guide](https://docs.block-kit.dev/installation) lists the remaining font weights, the Next.js setup and the entry points, and the [quickstart](https://docs.block-kit.dev/quickstart) wires up an interactive approval message.

Emoji are images that the viewer's browser loads from jsDelivr (`cdn.jsdelivr.net`, the `emoji-datasource-apple` package) unless you set `emoji.imageUrl`; the package doesn't bundle them. They are Apple's emoji artwork, which this package's MIT licence doesn't cover, and a page with a Content Security Policy needs `img-src https://cdn.jsdelivr.net`. The [emoji guide](https://docs.block-kit.dev/guides/emoji#where-the-default-images-come-from) shows how to serve them yourself or switch to another set.

## Entry points

| Import                            | What it contains                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@nkootstra/block-kit`            | Components, the provider, hooks and payload builders                                                             |
| `@nkootstra/block-kit/styles.css` | The stylesheet                                                                                                   |
| `@nkootstra/block-kit/mrkdwn`     | The mrkdwn parser, without React                                                                                 |
| `@nkootstra/block-kit/transport`  | Browser-safe: sends interactions to your app, and resolver lookups to your server                                |
| `@nkootstra/block-kit/server`     | Server only, development tooling: signs and relays interactions, and answers resolver lookups with the bot token |
| `@nkootstra/block-kit/web-api`    | User, channel, usergroup and profile resolvers backed by the Slack Web API                                       |

## License

[MIT](./LICENSE)
