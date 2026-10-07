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
    fireEvent.click(screen.getByRole("radio", { name: "Good response" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "feedback_buttons",
        action_id: "a1",
        block_id: "b1",
        value: "good",
        text: { type: "plain_text", text: "Good response", emoji: true },
      }),
      expect.anything(),
    );
  });

  // Measured in Block Kit Builder: Slack renders the pair as a radio group labelled "Rating".
  function renderPair(
    props: Pick<Parameters<typeof BlockKitProvider>[0], "onAction" | "onStateChange"> = {},
  ) {
    render(
      <BlockKitProvider onAction={props.onAction} onStateChange={props.onStateChange}>
        <FeedbackButtons element={element()} blockId="b1" />
      </BlockKitProvider>,
    );
    return {
      group: screen.getByRole("radiogroup", { name: "Rating" }),
      positive: screen.getByRole("radio", { name: "Good response" }),
      negative: screen.getByRole("radio", { name: "Bad response" }),
    };
  }

  it("is a radio group labelled Rating, with the first button as its tab stop", () => {
    const { positive, negative } = renderPair();
    expect([positive.getAttribute("aria-checked"), negative.getAttribute("aria-checked")]).toEqual([
      "false",
      "false",
    ]);
    expect([positive.tabIndex, negative.tabIndex]).toEqual([0, -1]);
  });

  it("keeps the picked button checked, and sends the action again when it's picked again", () => {
    const onAction = vi.fn();
    const { positive, negative } = renderPair({ onAction });
    fireEvent.click(positive);
    fireEvent.click(positive);
    expect(positive.getAttribute("aria-checked")).toBe("true");
    expect(onAction).toHaveBeenCalledTimes(2);
    fireEvent.click(negative);
    expect([positive.getAttribute("aria-checked"), negative.getAttribute("aria-checked")]).toEqual([
      "false",
      "true",
    ]);
    expect([positive.tabIndex, negative.tabIndex]).toEqual([-1, 0]);
  });

  it("shows the picked button with Slack's filled thumb", () => {
    const { positive, negative } = renderPair();
    const path = (el: HTMLElement) => el.querySelector("path")?.getAttribute("d") ?? "";
    fireEvent.click(negative);
    expect(path(negative)).toMatch(/^M12\.997 18\.343/);
    expect(path(positive)).toMatch(/^M10\.457 3\.036/);
    fireEvent.click(positive);
    expect(path(positive)).toMatch(/^M12\.997 1\.77/);
    expect(path(negative)).toMatch(/^M10\.957 16\.57/);
  });

  it("moves and picks with the arrow keys, sending an action, as Slack's radio group does", () => {
    const onAction = vi.fn();
    const { positive, negative } = renderPair({ onAction });
    fireEvent.click(negative);
    fireEvent.keyDown(negative, { key: "ArrowLeft" });
    expect(positive.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(positive);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: "good" }),
      expect.anything(),
    );
    fireEvent.keyDown(positive, { key: "ArrowRight" });
    expect(negative.getAttribute("aria-checked")).toBe("true");
  });

  it("leaves state.values alone, as Slack does for feedback buttons", () => {
    const states: StateValues[] = [];
    const { positive } = renderPair({ onStateChange: (s) => states.push(s) });
    fireEvent.click(positive);
    expect(states.some((s) => s.b1?.a1 !== undefined)).toBe(false);
  });
});
