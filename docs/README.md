# Block Kit for React

`@nkootstra/block-kit` renders Slack [Block Kit](https://docs.slack.dev/block-kit/) JSON in React, pixel-for-pixel the way Slack does. Pass it the `blocks` your app sends to `chat.postMessage` or `views.open` and it draws the message, modal or Home tab, with working buttons, menus, date pickers and inputs.

Documentation: **<https://block-kit.kootstra.io>**

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

The [installation guide](https://block-kit.kootstra.io/installation) lists the remaining font weights and the entry points, and the [quickstart](https://block-kit.kootstra.io/quickstart) wires up an interactive approval message.

## Entry points

| Import                            | What it contains                                                  |
| --------------------------------- | ----------------------------------------------------------------- |
| `@nkootstra/block-kit`            | Components, the provider, hooks and payload builders              |
| `@nkootstra/block-kit/styles.css` | The stylesheet                                                    |
| `@nkootstra/block-kit/mrkdwn`     | The mrkdwn parser, without React                                  |
| `@nkootstra/block-kit/transport`  | Sends interactions to your app's request URL from the browser     |
| `@nkootstra/block-kit/server`     | Signs and relays interactions to your app from your server        |
| `@nkootstra/block-kit/web-api`    | User, channel and usergroup resolvers backed by the Slack Web API |

## Repository layout

This is a Bun workspace run with Turborepo.

| Path                 | What it is                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| `packages/block-kit` | The published package                                                     |
| `apps/docs`          | The documentation site, built with [Blume](https://blume.dev)             |
| `apps/playground`    | A Block Kit playground for trying payloads against the renderer           |
| `fixtures`           | Block Kit Builder payloads with Slack's reference renders                 |
| `tools/visual`       | The harness that pixel-compares every fixture against its Slack reference |

## Develop

```sh
bun install
bun run build
bun run test
```

`bun run lint`, `bun run format:check` and `bun run type-check` run the remaining checks CI runs. `bun run compare` renders every fixture in the playground and reports how far each one drifts from Slack; see [`tools/visual`](../tools/visual/README.md).

To work on the docs, build the package once and start Blume's dev server:

```sh
bunx turbo run build --filter=@nkootstra/block-kit
cd apps/docs && bun run dev
```

## Docs deployment

The docs are a static site on [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), served at `block-kit.kootstra.io`, with the `_headers` file Blume writes for the raw Markdown endpoints. A small Worker, [`apps/docs/worker/index.ts`](../apps/docs/worker/index.ts), runs first on page routes, the `.md` copies and the docs API to negotiate with agents: `Accept: text/markdown` gets a page's Markdown copy, a missing page or `.md` URL gets `/404.md` with a 404 when Markdown was asked for, and JSON requests and the docs API get the `/404.json` problem document. Build assets and the other raw files skip the Worker.

Every push to `main` deploys:

1. The `check` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) builds the whole workspace, docs included, and uploads `apps/docs/dist` as an artifact.
2. Once every check passes, the `deploy-docs` job downloads that build and runs `wrangler deploy` in `apps/docs`.

Pull requests build the docs but never deploy them.

[`apps/docs/wrangler.jsonc`](../apps/docs/wrangler.jsonc) names the Worker `block-kit-docs`, serves `dist/`, answers unknown paths with the built `404.html`, and attaches the custom domain. `deployment.site` in [`apps/docs/blume.config.ts`](../apps/docs/blume.config.ts) holds the same URL, because Blume builds canonical links, the sitemap and Open Graph images from it. Change both if the domain moves.

### One-time Cloudflare setup

1. Make sure the `kootstra.io` zone is on the Cloudflare account you deploy to. The first deploy creates the `block-kit.kootstra.io` DNS record and certificate itself.
2. Create an API token under **My Profile → API Tokens** from the **Edit Cloudflare Workers** template. Limit **Account Resources** to your account and **Zone Resources** to `kootstra.io`.
3. Add two repository secrets under **Settings → Secrets and variables → Actions**:

   | Secret                  | Value                                                              |
   | ----------------------- | ------------------------------------------------------------------ |
   | `CLOUDFLARE_API_TOKEN`  | The token from step 2                                              |
   | `CLOUDFLARE_ACCOUNT_ID` | The account ID shown on the account's **Workers & Pages** overview |

To deploy by hand from a local build instead, log in once with `bunx wrangler login`, then:

```sh
bunx turbo run build --filter=@nkootstra/block-kit-docs
cd apps/docs && bunx wrangler@4 deploy
```

## License

[MIT](../LICENSE)
