# Block Kit for React

`@nkootstra/block-kit` renders Slack [Block Kit](https://docs.slack.dev/block-kit/) JSON in React, pixel-for-pixel the way Slack does. Pass it the `blocks` your app sends to `chat.postMessage` or `views.open` and it draws the message, modal or Home tab, with working buttons, menus, date pickers and inputs.

Documentation: **<https://docs.block-kit.dev>**

## Install

The package needs React 19 or later.

```sh
bun add @nkootstra/block-kit @fontsource/lato @fontsource/roboto-mono
```

Import the stylesheet and fonts once, near the root of your app, then render a message:

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

The [installation guide](https://docs.block-kit.dev/installation) lists the remaining font weights and the entry points, and the [quickstart](https://docs.block-kit.dev/quickstart) wires up an interactive approval message.

## Entry points

| Import                            | What it contains                                                  |
| --------------------------------- | ----------------------------------------------------------------- |
| `@nkootstra/block-kit`            | Components, the provider, hooks and payload builders              |
| `@nkootstra/block-kit/styles.css` | The stylesheet                                                    |
| `@nkootstra/block-kit/mrkdwn`     | The mrkdwn parser, without React                                  |
| `@nkootstra/block-kit/transport`  | Sends interactions to your app's request URL from the browser     |
| `@nkootstra/block-kit/server`     | Signs and relays interactions to your app from your server        |
| `@nkootstra/block-kit/web-api`    | User, channel and usergroup resolvers backed by the Slack Web API |

## License

[MIT](./LICENSE)
