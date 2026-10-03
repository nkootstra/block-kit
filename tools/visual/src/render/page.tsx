// Browser entry of the renderer (renderer.ts): bundled against one build of the library and loaded
// into a blank page, where `window.renderBlockKit` draws one payload.
import { BlockKitProvider, Message, View } from "@nkootstra/block-kit";
import { createRoot } from "react-dom/client";
import type { Payload } from "./payload";

const MESSAGE_WIDTH = 600;

declare global {
  interface Window {
    renderBlockKit(payload: Extract<Payload, { ok: true }>): Promise<void>;
  }
}

const root = createRoot(document.getElementById("root") as HTMLElement);

window.renderBlockKit = (payload) => {
  // Pinned like the playground's render page (apps/playground/src/RenderOnly.tsx), so a render
  // doesn't depend on the clock or the machine.
  root.render(
    payload.surface === "message" ? (
      <BlockKitProvider timeZone="Europe/Amsterdam">
        <div id="sbk-render" style={{ width: MESSAGE_WIDTH }}>
          <Message blocks={payload.blocks} app={{ name: "Your App" }} ts={43_200} timeZone="UTC" />
        </div>
      </BlockKitProvider>
    ) : (
      <BlockKitProvider timeZone="Europe/Amsterdam" surface={payload.surface}>
        <div id="sbk-render">
          <View view={payload.view} />
        </div>
      </BlockKitProvider>
    ),
  );
  // Two frames: one to commit, one for effects that measure the DOM (charts, carousels) to settle.
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
};
