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

[`CONTRIBUTING.md`](../CONTRIBUTING.md) covers the rules a pull request has to follow.

To work on the docs, build the package once and start Blume's dev server:

```sh
bunx turbo run build --filter=@nkootstra/block-kit
cd apps/docs && bun run dev
```

## Docs deployment

The docs are a static site on [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), served at `block-kit.kootstra.io`, with the `_headers` file Blume writes for the raw Markdown endpoints. A small Worker, [`apps/docs/worker/index.ts`](../apps/docs/worker/index.ts), runs first on page routes, the `.md` copies and the docs API to negotiate with agents: `Accept: text/markdown` gets a page's Markdown copy, a missing page or `.md` URL gets `/404.md` with a 404 when Markdown was asked for, and JSON requests and the docs API get the `/404.json` problem document. Build assets and the other raw files skip the Worker.

The changelog at `/changelog` comes from the GitHub releases: Blume's `githubReleases()` source in `blume.config.ts` turns each release into a page when the docs build. CI passes its token as `GITHUB_TOKEN`, because GitHub rate-limits anonymous requests. Without the token, a failed request falls back to Blume's cache, or to an empty changelog and a warning when there is none. After publishing, the Release workflow runs CI on `main` again, so the docs rebuild with the new release.

The Worker also serves the docs' MCP server at `/mcp`. Blume only generates its MCP server on a server build, and its Cloudflare server build is too large to deploy ([haydenbleasel/blume#322](https://github.com/haydenbleasel/blume/issues/322)). So after `blume build`, [`apps/docs/scripts/mcp.ts`](../apps/docs/scripts/mcp.ts) uses Blume's own builders to do two things:

- Write the snapshot the server answers from to `dist/mcp-data.json`, which `.assetsignore` keeps out of the public files.
- Add the server to the discovery files: `/.well-known/mcp.json`, `/.well-known/mcp/server-card.json`, `llms.txt`, `agent-readability.json` and the API and AI catalogs.

The Worker bundles the snapshot and answers with Blume's MCP handler, so a deploy needs the dependencies installed.

Every push to `main` deploys:

1. The `check` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) builds the whole workspace, docs included, and uploads `apps/docs/dist` as an artifact.
2. Once every check passes, the `deploy-docs` job downloads that build, installs the dependencies the Worker bundles, and runs `wrangler deploy` in `apps/docs`.

### Pull request previews

A pull request that affects the docs gets a preview on a `workers.dev` URL, deployed only once a maintainer approves it ([`.github/workflows/docs-preview.yml`](../.github/workflows/docs-preview.yml)):

1. CI builds the docs when the change affects them and uploads the build as `docs-preview`. That run has no secrets, also for pull requests from forks.
2. When CI passes, the workflow comments on the pull request that a preview is waiting, linking to the run, and waits for a required reviewer of the `docs-preview` environment.
3. After approval it deploys the build as the [Workers Preview](https://developers.cloudflare.com/workers/previews/) `pr-<number>` with `wrangler preview`, and updates the comment with the URL. Every push needs a new approval, and a commit that is no longer the pull request's head is skipped.
4. Closing the pull request deletes the Preview.

The deploy takes only the built files from the pull request; the Worker and `wrangler.jsonc` come from `main`, so a pull request can't change what runs with the Cloudflare token. Changes to the Worker therefore show up in previews once they merge. Previews set `ROBOTS` (`previews.vars` in `wrangler.jsonc`), which makes the Worker send `X-Robots-Tag: noindex`.

[`apps/docs/wrangler.jsonc`](../apps/docs/wrangler.jsonc) names the Worker `block-kit-docs`, serves `dist/`, answers unknown paths with the built `404.html`, and attaches the custom domain. `deployment.site` in [`apps/docs/blume.config.ts`](../apps/docs/blume.config.ts) holds the same URL, because Blume builds canonical links, the sitemap and Open Graph images from it. Change both if the domain moves.

### One-time Cloudflare setup

1. Make sure the `kootstra.io` zone is on the Cloudflare account you deploy to. The first deploy creates the `block-kit.kootstra.io` DNS record and certificate itself.
2. Create an API token under **My Profile → API Tokens** from the **Edit Cloudflare Workers** template. Limit **Account Resources** to your account and **Zone Resources** to `kootstra.io`.
3. Add two repository secrets under **Settings → Secrets and variables → Actions**:

   | Secret                  | Value                                                              |
   | ----------------------- | ------------------------------------------------------------------ |
   | `CLOUDFLARE_API_TOKEN`  | The token from step 2                                              |
   | `CLOUDFLARE_ACCOUNT_ID` | The account ID shown on the account's **Workers & Pages** overview |

4. Create the `docs-preview` environment under **Settings → Environments** and add the maintainers as **Required reviewers**. Previews use the same repository secrets; the environment is what makes them wait for approval.

To deploy by hand from a local build instead, log in once with `bunx wrangler login`, then:

```sh
bunx turbo run build --filter=@nkootstra/block-kit-docs
cd apps/docs && bunx wrangler@4 deploy
```

## Visual previews

A pull request whose changes alter how a fixture renders gets a comment with before, after and the
changes, in light and dark. Nothing is posted or updated when no rendering changed.

1. The `render-diff` job in [`.github/workflows/visual.yml`](../.github/workflows/visual.yml)
   renders every fixture with the base branch's build and the pull request's, and uploads the renders
   that differ as the `render-diff` artifact. It has no secrets, also for pull requests from forks.
2. [`.github/workflows/visual-preview.yml`](../.github/workflows/visual-preview.yml) runs main's code
   on `workflow_run`. It refuses an artifact with anything but the PNG renders its manifest lists,
   uploads the renders the comment shows (at most 40) to R2 and keeps one comment up to date. Like
   every `workflow_run` workflow, it only runs once it is on `main`.

Renders replace a payload's images with placeholders, so a pull request can't publish other images
through a fixture. Emoji still show: the library draws them from a fixed set. [`tools/visual`](../tools/visual/README.md#render-diff) covers running it locally.

### One-time R2 setup

1. Create the `block-kit-visual` R2 bucket, attach the custom domain `cdn.block-kit.dev` and add a
   lifecycle rule that deletes objects after 30 days.
2. Create an API token with **Workers R2 Storage Bucket Item Write** and **Read**, limited to that
   bucket. R2's S3 API authenticates with it: the access key ID is the token's ID, the secret is the
   SHA-256 hash of its value.
3. Add `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as repository secrets. The workflow also uses
   `CLOUDFLARE_ACCOUNT_ID`.

## License

[MIT](../LICENSE)
