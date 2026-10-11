# Next.js: keep the bot token on the server

Renders a Slack message with `@nkootstra/block-kit` in the App Router, resolving its mentions and
its `slack_file` image without the Slack bot token ever reaching the browser.

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

The relay and these routes are development and preview tooling: don't deploy them publicly. Without
a relay token, anyone who can reach the relay can look up any user and channel the bot can see, so
set `NEXT_PUBLIC_SLACK_RELAY_TOKEN` whenever the example is reachable beyond your machine (a tunnel,
a preview deploy, a shared network). That token is a development secret shared with the page, not a
Slack credential, so the `NEXT_PUBLIC_` prefix is fine for it. The file route only answers requests
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
with the scopes above, and change the ids in `lib/blocks.ts` to ones in your workspace. Never give
the variable a `NEXT_PUBLIC_` prefix: that publishes it in the page.
