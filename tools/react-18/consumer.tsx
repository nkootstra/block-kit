/**
 * An app on React 18 using the published package: checks the built declarations against
 * @types/react 18, with library checking on so a type that only exists in 19 fails here.
 */
import { BlockKitProvider, Blocks, HomeTab, Message, Modal } from "@nkootstra/block-kit";
import { parse } from "@nkootstra/block-kit/mrkdwn";
import { createRoot } from "react-dom/client";

export function App() {
  return (
    <BlockKitProvider onAction={(action) => console.log(action)}>
      <Message ts={1_700_000_000} blocks={[{ type: "divider" }]} />
      <Blocks blocks={[{ type: "divider" }]} />
      <Modal view={{ type: "modal", title: { type: "plain_text", text: "Hi" }, blocks: [] }} />
      <HomeTab view={{ type: "home", blocks: [] }} />
    </BlockKitProvider>
  );
}

createRoot(document.body).render(<App />);
parse("*bold*");
