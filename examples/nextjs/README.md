# Next.js: keep the bot token on the server

Renders a Slack message with `@nkootstra/block-kit` in the App Router, resolving its mentions and
its `slack_file` image, and sends its button clicks to an app through the interaction relay, without
the Slack bot token or the signing secret ever reaching the browser. It builds with
`cacheComponents`, the default for a new `create-next-app`.

## The trust boundary

A bot token can call the Slack Web API as your app, so it only exists on the server: in
`lib/slack.ts`, which `import "server-only"` keeps out of client components. The page gets names two
ways, shown side by side:

- **Through the resolver relay**: `app/relay-preview.tsx` (a client component) uses
  `httpResolverClient`, which asks `app/api/slack/resolve/route.ts`. That route answers with
  `createResolverRelay` and returns only names and profile fields.
- **Resolved on the server**: `app/page.tsx` (a Server Component) looks the mentions up and passes
  `app/server-resolved-preview.tsx` plain `{ id: name }` maps.

The image comes from `app/api/slack/files/[id]/route.ts`, which looks the file up with `files.info`
and streams it, sending the token only to `files.slack.com`.

The **Approve** and **Hold** buttons (`app/approval.tsx`, a client component) use `httpTransport`,
which posts each click unsigned to `app/api/slack/relay/route.ts`. That route answers with
`createInteractionRelay` (`lib/interactions.ts`): it signs the click with the signing secret, which
only the server has, and forwards it to the app's request URL. Without `SLACK_REQUEST_URL`, that's
a small demo app in the same server (`app/api/demo-app/slack/events/route.ts`) that verifies the
signature the way Bolt does and logs the action; the page shows the status the app answered with.
The demo app's address uses `PORT` (3000 by default).

The relays and these routes are development and preview tooling: don't deploy them publicly.
Without a relay token, anyone who can reach the resolver relay can look up any user and channel the
bot can see, and anyone who can reach the interaction relay can have it sign requests to your app.
`NEXT_PUBLIC_SLACK_RELAY_TOKEN` keeps out clients that never loaded the page; it isn't access
control, because the page carries it and anyone who can load the page can read it. Behind a
tunnel, a preview deploy or a shared network, put the whole example behind real authentication as
well. The token is not a Slack credential, so the `NEXT_PUBLIC_` prefix is fine for it; left empty,
it means no token. The file route only answers requests
from the example's own pages (`lib/session.ts`), which keeps other websites out; it isn't a login.

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
bun run build --filter=@block-kit/example-nextjs
cd examples/nextjs
bun run start
```

Then open http://localhost:3000. `bun run dev` works too.

**Without a Slack workspace:** leave `SLACK_BOT_TOKEN` unset and the example uses a small in-memory
workspace (`lib/slack.ts`) with placeholder people, a `#releases` channel, an `@eng` group and a
sample image. The page says so at the top while it's in use.

**With your workspace:** copy `.env.example` to `.env.local`, set `SLACK_BOT_TOKEN` to a bot token
with the scopes above, and change the ids in `lib/blocks.ts` to ones in your workspace. To send the
button clicks to your own app, set `SLACK_REQUEST_URL` to its request URL and
`SLACK_SIGNING_SECRET` to its signing secret; the build and the server fail with only the URL. Never
give `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` a `NEXT_PUBLIC_` prefix: that publishes it in the
page.
