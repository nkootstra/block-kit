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
 * The `slack_file` references show a file uploaded to the Builder's workspace (the block-kit logo,
 * 400,401 bytes). A reference's file URLs are redacted to this placeholder on import
 * (tools/visual/src/redact.ts, SLACK_FILE_PLACEHOLDER), the fixtures name it, and the comparison
 * serves fixtures/assets/slack-file.png for it to both sides, so they draw the same pixels. The
 * render resolves it as an app would resolve a real file through `resolvers.slackFile`.
 */
const SLACK_FILE_PLACEHOLDER = "https://files.slack.com/files-pri/T0000001-F0000001/file";
const SLACK_FILE_SIZE = 400_401;
/**
 * Block Kit Builder captions an image block's `image_url` with the size of the image it downloaded,
 * so the render gives the sizes of the sample images (fixtures/assets/samples/; a sample's name
 * carries its content hash, so its size never changes).
 */
const SAMPLE_BASE = "https://cdn.block-kit.dev/samples/";
const SAMPLE_BYTES: Record<string, number> = {
  "app-icon.81155d10.png": 641,
  "beagle.e3711bc4.jpg": 207_759,
  "bot-avatar.3d9f1d46.png": 598,
  "cat.da842b96.jpg": 40_951,
  "dinner-table.b8f41094.jpg": 305_583,
  "kitten-tree.6f72129c.jpg": 208_116,
  "kitten.4f40f3e3.jpg": 2282,
  "laptop-icon.4575d6fc.png": 1890,
  "mountain-lake.d12ac6fc.jpg": 42_701,
  "palm-tree.3fcaecef.jpg": 102_321,
  "plants.5b36fa8b.jpg": 221_056,
  "play-icon.24cf386c.png": 758,
  "portrait-2.bbcd2277.jpg": 2194,
  "portrait.ab6c68cb.jpg": 1886,
  "tacos.271c2dbf.jpg": 71_861,
  "video-thumbnail.d894bef5.jpg": 24_581,
  "warning-icon.491cc33b.png": 882,
};
const BUILDER_SAMPLE_FILES: Resolvers = {
  slackFile: (file) =>
    file.url === SLACK_FILE_PLACEHOLDER
      ? { url: SLACK_FILE_PLACEHOLDER, size: SLACK_FILE_SIZE }
      : undefined,
  imageSize: (url) =>
    url.startsWith(SAMPLE_BASE) ? SAMPLE_BYTES[url.slice(SAMPLE_BASE.length)] : undefined,
};

/**
 * Block Kit Builder fills users, conversations and channels selects with the signed-in workspace's
 * members and channels. The references are redacted to placeholders ("User One", "channel-one",
 * grey avatars), so the render lists the same placeholders, in the same order, through
 * `resolvers.directory`.
 */
const GREY_AVATAR =
  "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
// Slack's bot avatar is Slack's own artwork, so the render shows a drawn stand-in
// (fixtures/assets/samples/CREDITS.md).
const SLACKBOT_AVATAR = "https://cdn.block-kit.dev/samples/bot-avatar.3d9f1d46.png";
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
    realName: "User Two",
    presence: "active",
    avatarUrl: GREY_AVATAR,
  },
  {
    type: "user",
    id: "USER_THREE",
    name: "User Three",
    realName: "User Three",
    presence: "slackbot",
    avatarUrl: SLACKBOT_AVATAR,
  },
  {
    type: "user",
    id: "USER_FOUR",
    name: "User Four",
    badge: "AGENT",
    bot: true,
    presence: "active",
    avatarUrl: GREY_AVATAR,
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
