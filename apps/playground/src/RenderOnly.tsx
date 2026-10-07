import {
  BlockKitProvider,
  type DirectoryEntry,
  type HomeTabView,
  Message,
  type ModalView,
  type Resolvers,
  View,
} from "@nkootstra/block-kit";
import { fixtures } from "./fixtures";
import { parsePayload } from "./payload";

/**
 * Bare render of one fixture, used by the visual comparison against Block Kit Builder:
 * `/?render=message/approval&width=512&icon=<url>`. The message is pinned to 12:00 PM UTC so it
 * matches the time frozen into the reference snapshots. A fixture whose payload is a `view`
 * (`type: "modal"` or `"home"`) renders through `<View>` instead of `<Message>` — the reference's
 * snapshot root is the modal/home chrome itself, not a message row, so it gets the full width
 * with no Builder gutter subtracted. `&theme=dark` renders it in the dark theme, for a reference
 * captured with the Builder in dark mode (`<fixture>@dark`).
 */
/**
 * Block Kit Builder has no workspace files, so it shows its sample photo for the placeholder
 * `slack_file` URL in its catalog (the same image as its `image_url` samples, 72,704 bytes). The
 * render mirrors that, as an app would resolve a real file through `resolvers.slackFile`.
 */
const BUILDER_SAMPLE_FILES: Resolvers = {
  slackFile: (file) =>
    file.url === "<insert slack file url here>"
      ? {
          url: "https://assets3.thrillist.com/v1/image/1682388/size/tl-horizontal_main.jpg",
          size: 72_704,
        }
      : undefined,
};

/**
 * Block Kit Builder fills users, conversations and channels selects with the signed-in workspace's
 * members and channels. The references are redacted to placeholders ("User One", "channel-one",
 * grey avatars), so the render lists the same placeholders, in the same order, through
 * `resolvers.directory`.
 */
const GREY_AVATAR =
  "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
const SLACKBOT_AVATAR =
  "https://a.slack-edge.com/bv1-13-br/slackbot_notification_legacy-2118e8c.svg";
const BUILDER_USERS: DirectoryEntry[] = [
  {
    type: "user",
    id: "USER_ONE",
    name: "User One",
    self: true,
    presence: "snoozed",
    avatarUrl: GREY_AVATAR,
  },
  {
    type: "user",
    id: "USER_TWO",
    name: "User Two",
    badge: "AGENT",
    bot: true,
    presence: "active",
    avatarUrl: GREY_AVATAR,
  },
  {
    type: "user",
    id: "USER_THREE",
    name: "User Three",
    realName: "User Three",
    presence: "active",
    avatarUrl: GREY_AVATAR,
  },
  {
    type: "user",
    id: "USER_FOUR",
    name: "User Four",
    realName: "User Four",
    presence: "slackbot",
    avatarUrl: SLACKBOT_AVATAR,
  },
];
const CHANNEL_NAMES = ["one", "two", "three", "four", "five", "six", "seven"];
const channel = (n: number, isPrivate: boolean): DirectoryEntry => ({
  type: "channel",
  id: `CHANNEL_${CHANNEL_NAMES[n - 1]!.toUpperCase()}`,
  name: `channel-${CHANNEL_NAMES[n - 1]}`,
  private: isPrivate,
});

const BUILDER_RESOLVERS: Resolvers = {
  ...BUILDER_SAMPLE_FILES,
  directory: (source) =>
    source === "users"
      ? BUILDER_USERS
      : source === "channels"
        ? [1, 2, 3].map((n) => channel(n, false))
        : [...BUILDER_USERS, ...[1, 2, 3, 4, 5, 6, 7].map((n) => channel(n, n <= 4))],
};

export function RenderOnly({ params }: { params: URLSearchParams }) {
  const name = params.get("render") ?? "";
  // Left unset for light, so the existing references render exactly as before.
  const theme = params.get("theme") === "dark" ? ("dark" as const) : undefined;
  const fixture = fixtures.find((f) => f.name === name);
  if (!fixture) return <p>Unknown fixture {name}</p>;

  let raw: unknown;
  try {
    raw = JSON.parse(fixture.json);
  } catch (err) {
    return <p>{(err as Error).message}</p>;
  }
  const viewType =
    raw && typeof raw === "object" && "type" in raw ? (raw as { type: unknown }).type : undefined;

  if (viewType === "modal" || viewType === "home") {
    const view = { id: "V00000000", ...(raw as object) } as ModalView | HomeTabView;
    const width = Number(params.get("width")) || undefined;
    return (
      <BlockKitProvider
        timeZone="Europe/Amsterdam"
        surface={viewType}
        theme={theme}
        resolvers={BUILDER_RESOLVERS}
      >
        <div id="sbk-render" style={{ width }}>
          <View view={view} icon={params.get("icon") ?? undefined} />
        </div>
      </BlockKitProvider>
    );
  }

  const result = parsePayload(fixture.json);
  if (!result.ok) return <p>{result.error}</p>;
  // Builder keeps 36px free at the right of each message for its block menus.
  const width = Number(params.get("width")) - 36 || undefined;
  return (
    // References were captured in Europe/Amsterdam; their message time was pinned to 12:00 PM.
    <BlockKitProvider timeZone="Europe/Amsterdam" theme={theme} resolvers={BUILDER_RESOLVERS}>
      <div id="sbk-render" style={{ width }}>
        <Message
          blocks={result.blocks}
          app={{ name: "Your App", iconUrl: params.get("icon") ?? undefined }}
          ts={43_200}
          timeZone="UTC"
        />
      </div>
    </BlockKitProvider>
  );
}
