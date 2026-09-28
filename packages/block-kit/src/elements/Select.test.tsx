import type { AnyBlock, PlainTextOption } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { Message } from "../Message";
import { Select, type SelectElement } from "./Select";
import { clickAsync, keyDownAsync } from "./test-utils";

afterEach(cleanup);

function opt(value: string, text: string): PlainTextOption {
  return { value, text: { type: "plain_text", text } } as unknown as PlainTextOption;
}

describe("<Select> static_select", () => {
  it("reports initial_option as selected_option on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              options: [opt("a", "A"), opt("b", "B")],
              initial_option: opt("a", "A"),
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({ type: "static_select", selected_option: opt("a", "A") });
  });

  it("opens the menu, selects an option, and dispatches selected_option", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Choose" },
              options: [opt("a", "A"), opt("b", "B")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Choose")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    await clickAsync(screen.getByText("B"));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "static_select",
        action_id: "a1",
        block_id: "b1",
        selected_option: opt("b", "B"),
      }),
      expect.anything(),
    );
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("dispatches selected_options (plural) for multi_static_select", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={
            {
              type: "multi_static_select",
              action_id: "a1",
              options: [opt("a", "A"), opt("b", "B")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    // multi-select keeps the menu open across picks, so the trigger is only clicked once.
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    await clickAsync(screen.getByText("A"));
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_options: [opt("a", "A")] }),
      expect.anything(),
    );
    await clickAsync(screen.getByText("B"));
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_options: [opt("a", "A"), opt("b", "B")] }),
      expect.anything(),
    );
  });
});

describe("<Select> users_select / channels_select", () => {
  it("uses selected_user as the field name for users_select", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={{ type: "users_select", action_id: "a1" } as unknown as SelectElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    const searchInput = screen.getByPlaceholderText("Search users");
    fireEvent.change(searchInput, { target: { value: "U123" } });
    await keyDownAsync(searchInput, "Enter");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "users_select", selected_user: "U123" }),
      expect.anything(),
    );
  });

  it("shows a 'Private channel' pill for an unresolved initial_channel", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "channels_select",
              action_id: "a1",
              initial_channel: "C0UNKNOWN",
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Private channel")).toBeTruthy();
  });

  it("shows the resolved label instead of the pill when a channel resolver knows the id", () => {
    render(
      <BlockKitProvider resolvers={{ channel: (id) => (id === "C1" ? "general" : undefined) }}>
        <Select
          element={
            {
              type: "channels_select",
              action_id: "a1",
              initial_channel: "C1",
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("general")).toBeTruthy();
    expect(screen.queryByText("Private channel")).toBeNull();
  });

  it("moves the highlight with the arrow keys and chooses it with Enter", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Choose" },
              options: [opt("a", "A"), opt("b", "B"), opt("c", "C")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Opening highlights the first option; two more presses land on "C", one more wraps to "A".
    expect(screen.getByText("A").closest("[data-active]")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByText("C").closest("[data-active]")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByText("B").closest("[data-active]")).toBeTruthy();
    await keyDownAsync(trigger, "Enter");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ selected_option: opt("b", "B") }),
      expect.anything(),
    );
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Choose" },
              options: [opt("a", "A")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });
});

describe("<Select> external_select with onOptions", () => {
  const element = {
    type: "external_select",
    action_id: "fruit",
    placeholder: { type: "plain_text", text: "Pick a fruit" },
    min_query_length: 2,
  } as unknown as SelectElement;
  const actionsBlock = [
    { type: "actions", elements: [{ ...element, min_query_length: 0 }] },
  ] as unknown as AnyBlock[];

  it("sends a block_suggestion once the query reaches min_query_length, then offers the options", async () => {
    const onOptions = vi.fn(({ value }: { value: string }) => ({
      options: ["Apple", "Apricot", "Banana"]
        .filter((f) => f.toLowerCase().startsWith(value.toLowerCase()))
        .map((f) => opt(f.toLowerCase(), f)),
    }));
    const onAction = vi.fn();
    render(
      <BlockKitProvider onOptions={onOptions as never} onAction={onAction}>
        <Message
          blocks={
            [
              {
                type: "section",
                block_id: "b1",
                text: { type: "mrkdwn", text: "Fruit" },
                accessory: element,
              },
            ] as never
          }
        />
      </BlockKitProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Pick a fruit/ }));
    const search = screen.getByPlaceholderText("Search options");
    fireEvent.change(search, { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 300));
    expect(onOptions).not.toHaveBeenCalled();

    fireEvent.change(search, { target: { value: "ap" } });
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Apricot" })).toBeTruthy());
    expect(onOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "block_suggestion",
        action_id: "fruit",
        block_id: "b1",
        value: "ap",
        container: expect.objectContaining({ type: "message" }),
      }),
    );
    expect(screen.queryByRole("option", { name: "Banana" })).toBeNull();

    await clickAsync(screen.getByRole("option", { name: "Apricot" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action_id: "fruit", selected_option: opt("apricot", "Apricot") }),
      expect.anything(),
    );
  });

  it("asks once per query even when an inline onOptions re-renders the parent", async () => {
    const calls: string[] = [];
    function Host() {
      const [, setCount] = useState(0);
      return (
        <BlockKitProvider
          onOptions={({ value }) => {
            calls.push(value);
            setCount((c) => c + 1);
            return { options: [opt("x", `${value} result`)] as never };
          }}
        >
          <Message blocks={actionsBlock} />
        </BlockKitProvider>
      );
    }
    render(<Host />);

    fireEvent.click(screen.getByRole("button", { name: /Pick a fruit/ }));
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "result" })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toEqual([""]);
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("shows No results when the app returns nothing", async () => {
    render(
      <BlockKitProvider onOptions={() => ({ options: [] })}>
        <Message blocks={actionsBlock} />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Pick a fruit/ }));
    await vi.waitFor(() => expect(screen.getByText("No results")).toBeTruthy());
  });
});

describe("<Select> conversation, user and channel sources", () => {
  const cases = [
    ["conversations_select", "conversations", "selected_conversation", "C123"],
    ["multi_users_select", "users", "selected_users", ["U1", "U2"]],
    ["multi_conversations_select", "conversations", "selected_conversations", ["C1", "D2"]],
    ["multi_channels_select", "channels", "selected_channels", ["C1", "C2"]],
  ] as const;

  it.each(cases)("%s reports %s ids as %s", async (type, source, field, expected) => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select element={{ type, action_id: "a1" } as unknown as SelectElement} blockId="b1" />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    const search = screen.getByPlaceholderText(`Search ${source}`);
    for (const id of Array.isArray(expected) ? expected : [expected]) {
      fireEvent.change(search, { target: { value: id } });
      await keyDownAsync(search, "Enter");
    }
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type, [field]: expected }),
      expect.anything(),
    );
  });

  it("reports multi-select initial ids on mount", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <Select
          element={
            {
              type: "multi_conversations_select",
              action_id: "a1",
              initial_conversations: ["C1", "C2"],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(state.b1?.a1).toEqual({
      type: "multi_conversations_select",
      selected_conversations: ["C1", "C2"],
    });
  });
});

describe("<Select> max_selected_items", () => {
  it("stops adding once the limit is reached, and allows it again after removing one", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={
            {
              type: "multi_static_select",
              action_id: "a1",
              max_selected_items: 2,
              options: [opt("a", "A"), opt("b", "B"), opt("c", "C")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    await clickAsync(screen.getByRole("option", { name: "A" }));
    await clickAsync(screen.getByRole("option", { name: "B" }));
    await clickAsync(screen.getByRole("option", { name: "C" }));
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_options: [opt("a", "A"), opt("b", "B")] }),
      expect.anything(),
    );
  });
});

describe("<Select> multi_external_select with onOptions", () => {
  it("adds options from the app's block_suggestion answers, reported as selected_options", async () => {
    const onOptions = vi.fn(({ value }: { value: string }) => ({
      options: [opt(`${value}-1`, `${value} one`), opt(`${value}-2`, `${value} two`)],
    }));
    const onAction = vi.fn();
    render(
      <BlockKitProvider onOptions={onOptions as never} onAction={onAction}>
        <Message
          blocks={
            [
              {
                type: "actions",
                block_id: "b1",
                elements: [
                  {
                    type: "multi_external_select",
                    action_id: "tags",
                    min_query_length: 1,
                    placeholder: { type: "plain_text", text: "Add tags" },
                  },
                ],
              },
            ] as never
          }
        />
      </BlockKitProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Add tags/ }));
    fireEvent.change(screen.getByPlaceholderText("Search options"), { target: { value: "x" } });
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "x one" })).toBeTruthy());
    expect(onOptions).toHaveBeenCalledWith(
      expect.objectContaining({ type: "block_suggestion", action_id: "tags", value: "x" }),
    );
    await clickAsync(screen.getByRole("option", { name: "x one" }));

    fireEvent.change(screen.getByPlaceholderText("Search options"), { target: { value: "y" } });
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "y two" })).toBeTruthy());
    await clickAsync(screen.getByRole("option", { name: "y two" }));
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "multi_external_select",
        selected_options: [opt("x-1", "x one"), opt("y-2", "y two")],
      }),
      expect.anything(),
    );
  });
});
