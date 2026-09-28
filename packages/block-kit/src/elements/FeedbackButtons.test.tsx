import type { FeedbackButtons as FeedbackButtonsElement } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { FeedbackButtons } from "./FeedbackButtons";

afterEach(cleanup);

function element(): FeedbackButtonsElement {
  return {
    type: "feedback_buttons",
    action_id: "a1",
    positive_button: { text: { type: "plain_text", text: "Good response" }, value: "good" },
    negative_button: { text: { type: "plain_text", text: "Bad response" }, value: "bad" },
  } as unknown as FeedbackButtonsElement;
}

describe("<FeedbackButtons>", () => {
  it("dispatches the positive button's value and text when clicked", () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <FeedbackButtons element={element()} blockId="b1" />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Good response" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feedback_buttons",
        action_id: "a1",
        block_id: "b1",
        value: "good",
        text: { type: "plain_text", text: "Good response" },
      }),
      expect.anything(),
    );
  });

  it("only allows one of positive/negative to be picked, toggling off on repeat click", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <FeedbackButtons element={element()} blockId="b1" />
      </BlockKitProvider>,
    );
    const positive = screen.getByRole("button", { name: "Good response" });
    const negative = screen.getByRole("button", { name: "Bad response" });

    fireEvent.click(positive);
    expect(positive.getAttribute("aria-pressed")).toBe("true");
    expect(state.b1?.a1).toEqual({ type: "feedback_buttons", value: "good" });

    fireEvent.click(negative);
    expect(positive.getAttribute("aria-pressed")).toBe("false");
    expect(negative.getAttribute("aria-pressed")).toBe("true");
    expect(state.b1?.a1).toEqual({ type: "feedback_buttons", value: "bad" });

    fireEvent.click(negative);
    expect(negative.getAttribute("aria-pressed")).toBe("false");
    expect(state.b1?.a1).toBeUndefined();
  });
});
