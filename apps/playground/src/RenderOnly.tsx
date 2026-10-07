import {
  BlockKitProvider,
  type HomeTabView,
  Message,
  type ModalView,
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
      <BlockKitProvider timeZone="Europe/Amsterdam" surface={viewType} theme={theme}>
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
    <BlockKitProvider timeZone="Europe/Amsterdam" theme={theme}>
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
