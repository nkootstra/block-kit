import { act, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "./context";
import { Message } from "./Message";
import { View } from "./surfaces/View";
import badPayloads from "./badPayloads.test.json";

/**
 * The payloads of `badPayloads.test.tsx`, rendered in the browser instead of on the server: there
 * effects run too, and a throw unmounts the host's whole tree.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(payload: { type?: unknown }): void {
  const element =
    payload.type === "modal" || payload.type === "home" ? (
      <BlockKitProvider surface={payload.type}>
        <View view={{ id: "V0123456789", ...payload } as never} />
      </BlockKitProvider>
    ) : (
      <BlockKitProvider>
        <Message message={{ ts: "1700000000.000000", ...payload } as never} />
      </BlockKitProvider>
    );
  const container = document.createElement("div");
  document.body.append(container);
  const caught: unknown[] = [];
  const root = createRoot(container);
  // React logs what a boundary catches; the error is reported by the test instead.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    act(() => root.render(<Boundary caught={caught}>{element}</Boundary>));
  } finally {
    act(() => root.unmount());
    consoleError.mockRestore();
    container.remove();
  }
  if (caught.length > 0) throw caught[0];
}

/** Records what its children throw in render or an effect, in React 18 and 19 alike. */
class Boundary extends Component<{ caught: unknown[]; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.caught.push(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

describe("payloads of the wrong shape, in the browser", () => {
  it.each(badPayloads.map((payload) => [JSON.stringify(payload), payload]))(
    "renders %s",
    (_, payload) => {
      expect(() => render(payload as { type?: unknown })).not.toThrow();
    },
  );
});
