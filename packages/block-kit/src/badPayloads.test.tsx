// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlockKitProvider } from "./context";
import { Message } from "./Message";
import { View } from "./surfaces/View";
import badPayloads from "./badPayloads.test.json";

/**
 * A payload is untyped JSON from whoever wrote it, so any field can be missing or of another type.
 * A render that throws takes down the host's whole tree, or the whole server response. These are
 * the smallest payloads a type-confusion fuzzer over every fixture found to throw: each must
 * render, on the server, without throwing.
 */
function render(payload: { type?: unknown }): string {
  if (payload.type === "modal" || payload.type === "home") {
    return renderToString(
      <BlockKitProvider surface={payload.type}>
        <View view={{ id: "V0123456789", ...payload } as never} />
      </BlockKitProvider>,
    );
  }
  return renderToString(
    <BlockKitProvider>
      <Message message={{ ts: "1700000000.000000", ...payload } as never} />
    </BlockKitProvider>,
  );
}

describe("payloads of the wrong shape", () => {
  it.each(badPayloads.map((payload) => [JSON.stringify(payload), payload]))(
    "renders %s",
    (_, payload) => {
      expect(() => render(payload as { type?: unknown })).not.toThrow();
    },
  );
});
