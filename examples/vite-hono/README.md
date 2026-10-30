# Vite + Hono: keep the bot token on the server

Renders a Slack message with `@nkootstra/block-kit` in a Vite single-page app, resolving its
mentions and its `slack_file` image through a Hono server, and sends its button clicks to an app
through the interaction relay, without the Slack bot token or the signing secret ever reaching the
browser.

## The trust boundary

A bot token can call the Slack Web API as your app, so it only exists on the server: in
`server/slack.ts`, which only the Hono server in `server/` imports. Vite builds the page in `src/`
and only exposes `VITE_`-prefixed variables to it. The page gets names two ways, shown side by side:

- **Through the resolver relay**: `src/App.tsx` uses `httpResolverClient`, which asks
  `POST /api/slack/resolve`. The server answers with `createResolverRelay` and returns only names
  and profile fields.
- **Resolved on the server**: `GET /api/message` returns the message with its mentions already
  looked up, as plain `{ id: name }` maps.

The image comes from `GET /api/slack/files/:id`, which looks the file up with `files.info` and
streams it, sending the token only to `files.slack.com`.

The **Approve** and **Hold** buttons (`src/Approval.tsx`) use `httpTransport`, which posts each
click unsigned to `POST /api/slack/relay`. The server answers with `createInteractionRelay`
(`server/interactions.ts`): it signs the click with the signing secret, which only the server has,
and forwards it to the app's request URL. Without `SLACK_REQUEST_URL`, that's a small demo app in
the same server (`POST /api/demo-app/slack/events`) that verifies the signature the way Bolt does
and logs the action; the page shows the status the app answered with.

The relays and these routes are development and preview tooling: don't deploy them publicly.
Without a relay token, anyone who can reach the resolver relay can look up any user and channel the
bot can see, and anyone who can reach the interaction relay can have it sign requests to your app.
`VITE_SLACK_RELAY_TOKEN` keeps out clients that never loaded the page; it isn't access control,
because the page carries it and anyone who can load the page can read it. Behind a tunnel, a
preview deploy or a shared network, put the whole example behind real authentication as well. The
token is not a Slack credential, so the `VITE_` prefix is fine for it; left empty, it means no
token. The file and message routes only answer
requests from the example's own pages (`server/session.ts`), which keeps other websites out; it
isn't a login.

## Scopes

| Scope             | For                                                 |
| ----------------- | --------------------------------------------------- |
| `users:read`      | User names and profile cards (`users.info`)         |
| `channels:read`   | Channel names (`conversations.info`)                |
| `groups:read`     | Only if you need private channel names              |
| `usergroups:read` | User group handles (`usergroups.list`)              |
| `files:read`      | `slack_file` images (`files.info` and the download) |

Don't add `users:read.email`: nothing here reads an email address.

## Run it

From the repository root:

```sh
bun install
bun run build --filter=@block-kit/example-vite-hono
cd examples/vite-hono
bun run start
```

Then open http://localhost:8787. `bun run dev` starts the Hono server and Vite's dev server
(http://localhost:5173, which forwards `/api` to Hono).

**Without a Slack workspace:** leave `SLACK_BOT_TOKEN` unset and the example uses a small in-memory
workspace (`server/slack.ts`) with placeholder people, a `#releases` channel, an `@eng` group and a
sample image. The page says so at the top, and the server logs it when it starts.

**With your workspace:** copy `.env.example` to `.env.local` (Bun loads it), set `SLACK_BOT_TOKEN`
to a bot token with the scopes above, and change the ids in `server/blocks.ts` to ones in your
workspace. To send the button clicks to your own app, set `SLACK_REQUEST_URL` to its request URL
and `SLACK_SIGNING_SECRET` to its signing secret; the server won't start with only the URL. Never
give `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` a `VITE_` prefix: that publishes it in the page.
