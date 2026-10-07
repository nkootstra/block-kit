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

/** The option as Slack sends it back in an action: its plain_text gains `emoji: true`. */
function sent(value: string, text: string) {
  return { value, text: { type: "plain_text", text, emoji: true } };
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
    expect(state.b1?.a1).toEqual({ type: "static_select", selected_option: sent("a", "A") });
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
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.getAttribute("placeholder")).toBe("Choose");
    fireEvent.click(input);
    await clickAsync(screen.getByText("B"));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "static_select",
        action_id: "a1",
        block_id: "b1",
        selected_option: sent("b", "B"),
      }),
      expect.anything(),
    );
    expect(input.value).toBe("B");
    // The menu closes after a pick.
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the chosen option in an overlay over the field, hidden while typing", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              options: [opt("a", "A"), opt("b", "B")],
              initial_option: opt("b", "B"),
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const overlay = () => document.querySelector(".sbk-select__content");
    expect(overlay()?.textContent).toBe("B");
    expect(overlay()?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByRole("combobox"));
    expect(overlay()).toBeNull();
  });

  it("filters the options by what's typed into the field, with no separate search box", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              // More than 8 options used to add a search box above the list.
              options: "ABCDEFGHIJ".split("").map((l) => opt(l.toLowerCase(), `Option ${l}`)),
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    expect(screen.queryByPlaceholderText("Search options")).toBeNull();
    fireEvent.change(input, { target: { value: "option c" } });
    expect(
      screen
        .getAllByRole("option")
        .map((o) => o.querySelector(".sbk-select__option-text")?.textContent),
    ).toEqual(["Option C"]);
    expect(screen.getByText("Option C").closest("[data-active]")).toBeTruthy();
  });

  it("picks the highlighted option with Enter after typing", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={
            {
              type: "static_select",
              action_id: "a1",
              options: [opt("a", "Apple"), opt("b", "Banana"), opt("c", "Cherry")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    // Slack matches the start of a word, so "ban" (not "an") finds Banana.
    fireEvent.change(input, { target: { value: "ban" } });
    await keyDownAsync(input, "Enter");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ selected_option: sent("b", "Banana") }),
      expect.anything(),
    );
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
      expect.objectContaining({ selected_options: [sent("a", "A")] }),
      expect.anything(),
    );
    await clickAsync(screen.getByText("B"));
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected_options: [sent("a", "A"), sent("b", "B")] }),
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

  it("prefixes the unresolved channel pill with a channel hash, like Slack", () => {
    const { container } = render(
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
    expect(container.querySelector(".sbk-select__channel-hash")).toBeTruthy();
  });

  it("shows a loading skeleton, not the raw id, for an unresolved initial_user", () => {
    const { container } = render(
      <BlockKitProvider>
        <Select
          element={
            { type: "users_select", action_id: "a1", initial_user: "U0UNKNOWN" } as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.queryByText("U0UNKNOWN")).toBeNull();
    expect(container.querySelector(".sbk-select__skeleton")).toBeTruthy();
  });

  it("leaves an unresolved initial_conversation blank, like Slack", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "conversations_select",
              action_id: "a1",
              placeholder: { type: "plain_text", text: "Pick one" },
              initial_conversation: "G0UNKNOWN",
            } as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.queryByText("Private channel")).toBeNull();
    expect(screen.queryByText("G0UNKNOWN")).toBeNull();
    expect(screen.queryByText("Pick one")).toBeNull();
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
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Opening highlights the first option (Slack's typed highlight); the first press keeps it on
    // "A" as the keyboard highlight, two more land on "C".
    expect(screen.getByText("A").closest("[data-active]")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByText("A").closest("[data-active]:not([data-typed])")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByText("C").closest("[data-active]")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByText("B").closest("[data-active]")).toBeTruthy();
    await keyDownAsync(trigger, "Enter");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ selected_option: sent("b", "B") }),
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
    const trigger = screen.getByRole("combobox");
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

    const search = screen.getByRole("combobox", { name: /Pick a fruit/ });
    fireEvent.click(search);
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
      expect.objectContaining({ action_id: "fruit", selected_option: sent("apricot", "Apricot") }),
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

    fireEvent.click(screen.getByRole("combobox", { name: /Pick a fruit/ }));
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
    fireEvent.click(screen.getByRole("combobox", { name: /Pick a fruit/ }));
    await vi.waitFor(() => expect(screen.getByText("😕 Nothing could be found.")).toBeTruthy());
  });
});

// Measured in Block Kit Builder (see the PR): what Slack's option lists show while you type.
describe("<Select> list states", () => {
  const static3 = {
    type: "static_select",
    action_id: "a1",
    placeholder: { type: "plain_text", text: "Pick one" },
    options: [opt("a", "Alpha"), opt("b", "Bravo"), opt("c", "Charlie")],
  } as unknown as SelectElement;

  function renderSelect(element: SelectElement, props = {}) {
    render(
      <BlockKitProvider {...props}>
        <Select element={element} blockId="b1" />
      </BlockKitProvider>,
    );
    return screen.queryByRole("combobox") as HTMLElement;
  }
  const rows = () => screen.queryAllByRole("option").map((o) => o.textContent);

  it("matches what's typed against the start of each word, keeping the options' order", () => {
    const input = renderSelect({
      ...static3,
      options: [
        opt("ny", "New York"),
        opt("oa", "Old Alpha"),
        opt("ab", "Alpha-Beta"),
        opt("xa", "x(alpha)"),
      ],
    } as unknown as SelectElement);
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "al" } });
    expect(rows()).toEqual(["Old AlphaEnter", "Alpha-Beta", "x(alpha)"]);
    fireEvent.change(input, { target: { value: "york" } });
    expect(rows()).toEqual(["New YorkEnter"]);
  });

  it("says nothing could be found when no option matches", () => {
    const input = renderSelect(static3);
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "rav" } });
    expect(rows()).toEqual(["😕 Nothing could be found."]);
    expect(screen.getByRole("option").getAttribute("aria-disabled")).toBe("true");
  });

  // Captured in Block Kit Builder (`@open` references): a list opened with a click highlights its
  // first row in blue, with no Enter key.
  it("highlights the first row in blue, without an Enter key, when a click opens the list", () => {
    const input = renderSelect(static3);
    fireEvent.click(input);
    expect(rows()).toEqual(["Alpha", "Bravo", "Charlie"]);
    const active = screen.getByText("Alpha").closest("[data-active]");
    expect([Boolean(active), active?.hasAttribute("data-typed")]).toEqual([true, false]);
  });

  // Captured in Block Kit Builder (`extra/modal/form@open`): with an option chosen, a click opens
  // the list on its first row; the chosen one is marked with a check in blue, and the field is
  // emptied to the placeholder.
  describe("with an option chosen", () => {
    const chosen = { ...static3, initial_option: opt("b", "Bravo") } as unknown as SelectElement;

    it("opens on the first row, marking the chosen one with a check", () => {
      const input = renderSelect(chosen);
      fireEvent.click(input);
      expect(screen.getByText("Alpha").closest("[data-active]")).toBeTruthy();
      const bravo = screen.getByText("Bravo").closest('[role="option"]')!;
      expect([
        bravo.getAttribute("aria-selected"),
        Boolean(bravo.querySelector(".sbk-select__check")),
      ]).toEqual(["true", true]);
    });

    it("empties the field to the placeholder while the list is open", () => {
      const input = renderSelect(chosen) as HTMLInputElement;
      fireEvent.click(input);
      expect([input.value, input.placeholder]).toEqual(["", "Pick one"]);
    });
  });

  it("moves on from the clicked-open highlight with the first arrow key", () => {
    const input = renderSelect(static3);
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByText("Bravo").closest("[data-active]")).toBeTruthy();
  });

  it("marks the first row with an Enter key when the keyboard opens the list and while typing", () => {
    const input = renderSelect(static3);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(rows()).toEqual(["AlphaEnter", "Bravo", "Charlie"]);
    fireEvent.change(input, { target: { value: "b" } });
    expect(rows()).toEqual(["BravoEnter"]);
  });

  it("drops the Enter key once the arrow keys take over, the first press staying on that row", () => {
    const input = renderSelect(static3);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(rows()).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(screen.getByText("Alpha").closest("[data-active]")).toBeTruthy();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByText("Bravo").closest("[data-active]")).toBeTruthy();
  });

  it("keeps what was typed after Escape, and offers the same matches when reopened", () => {
    const input = renderSelect(static3) as HTMLInputElement;
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "br" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value).toBe("br");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(rows()).toEqual(["BravoEnter"]);
  });

  it("asks for the minimum number of characters before an external select searches", () => {
    renderSelect(
      { type: "external_select", action_id: "e1", min_query_length: 2 } as unknown as SelectElement,
      { onOptions: () => ({ options: [] }) },
    );
    // Captured in Block Kit Builder (`extra/actions/more-elements@open`): Slack's external select
    // is typed into, like the static one, with no search box in its list.
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    expect(rows()).toEqual(["Type a minimum of 2 characters to see options."]);
    expect(screen.queryByPlaceholderText("Search options")).toBeNull();
    fireEvent.change(input, { target: { value: "x" } });
    expect(rows()).toEqual(["Type a minimum of 2 characters to see options."]);
  });

  it("ticks the options a multi-select already has", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              ...static3,
              type: "multi_static_select",
              initial_options: [opt("a", "Alpha")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    fireEvent.click(document.querySelector(".sbk-select__control")!);
    const alpha = screen.getByRole("option", { name: /Alpha/ });
    expect(alpha.querySelector(".sbk-select__check")).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /Bravo/ }).querySelector(".sbk-select__check"),
    ).toBeNull();
  });

  it("separates option groups with a divider", () => {
    const input = renderSelect({
      ...static3,
      options: undefined,
      option_groups: [
        {
          label: { type: "plain_text", text: "Group one" },
          options: [opt("a", "Alpha"), opt("b", "Bravo")],
        },
        { label: { type: "plain_text", text: "Group two" }, options: [opt("c", "Charlie")] },
      ],
    } as unknown as SelectElement);
    fireEvent.click(input);
    expect(document.querySelectorAll(".sbk-select__divider")).toHaveLength(1);
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
      expect.objectContaining({ selected_options: [sent("a", "A"), sent("b", "B")] }),
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
        selected_options: [sent("x-1", "x one"), sent("y-2", "y two")],
      }),
      expect.anything(),
    );
  });
});

describe("<Select> multi-select chips", () => {
  it("shows an unresolved initial channel as a 'Private channel' chip, not its id", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "multi_channels_select",
              action_id: "a1",
              initial_channels: ["C0UNKNOWN"],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Private channel")).toBeTruthy();
    expect(screen.queryByText("C0UNKNOWN")).toBeNull();
  });

  it("tells the user how many items they can pick when max_selected_items is set", () => {
    render(
      <BlockKitProvider>
        <Select
          element={
            {
              type: "multi_external_select",
              action_id: "a1",
              max_selected_items: 3,
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("You can select up to 3 items.")).toBeTruthy();
  });

  function renderChips(onAction = vi.fn()) {
    render(
      <BlockKitProvider onAction={onAction}>
        <Select
          element={
            {
              type: "multi_static_select",
              action_id: "a1",
              options: [opt("a", "Alpha"), opt("b", "Bravo"), opt("c", "Charlie")],
              initial_options: [opt("a", "Alpha"), opt("b", "Bravo")],
            } as unknown as SelectElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    return onAction;
  }

  it.each(["Enter", " "])("removes a chip with %j on its remove button", async (key) => {
    const onAction = renderChips();
    await keyDownAsync(screen.getByRole("button", { name: "Remove Alpha" }), key);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "multi_static_select",
        selected_options: [sent("b", "Bravo")],
      }),
      expect.anything(),
    );
    expect(screen.queryByRole("button", { name: "Remove Alpha" })).toBeNull();
  });

  it("removes only the chip when Enter is pressed on it while the menu has a highlighted option", async () => {
    const onAction = renderChips();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    // Highlight Charlie, the one option not yet chosen, so Enter would pick it if it got there.
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "End" });
    await keyDownAsync(screen.getByRole("button", { name: "Remove Alpha" }), "Enter");
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ selected_options: [sent("b", "Bravo")] }),
      expect.anything(),
    );
  });
});
