// Browser entry of the interaction harness (harness.ts): bundled against the library's source and
// loaded into a blank page, where `window.mountBlockKit` draws one message or view to interact with.
import { type AnyView, BlockKitProvider, Message, View } from "@nkootstra/block-kit";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { Mount } from "./harness";

declare global {
  interface Window {
    mountBlockKit(mount: Mount): Promise<void>;
  }
}

const root = createRoot(document.getElementById("root") as HTMLElement);

window.mountBlockKit = ({ blocks, view, theme = "light", errors, opens }) => {
  root.render(
    <BlockKitProvider
      timeZone="UTC"
      theme={theme}
      errors={errors}
      onAction={(_action, { views }) => {
        if (opens) views.open(opens as unknown as Parameters<typeof views.open>[0]);
      }}
      surface={view ? (view.type as "modal" | "home") : "message"}
    >
      <div id="sbk-render" style={{ width: 600 }}>
        {/* Payloads come in as plain JSON; the library validates them as it renders. */}
        {view ? (
          <View view={view as unknown as AnyView} />
        ) : (
          <Message
            blocks={(blocks ?? []) as ComponentProps<typeof Message>["blocks"]}
            app={{ name: "Your App" }}
            ts={43_200}
            timeZone="UTC"
          />
        )}
      </div>
    </BlockKitProvider>,
  );
  // Two frames: one to commit, one for effects that measure the DOM to settle.
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
};
