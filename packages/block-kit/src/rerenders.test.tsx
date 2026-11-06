import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockComponents } from "./blocks/index";
import { BlockKitProvider, type StateValues, useBlockKit } from "./context";
import { clickAsync } from "./elements/test-utils";
import { Message } from "./Message";
import { Modal } from "./surfaces/Modal";
import type { BlockProps, Json } from "./types";

// A `probe` block renders a built-in block inside a Profiler, so a test can count which blocks
// re-render after an interaction in one of them.
const BuiltIn = { actions: blockComponents.actions, input: blockComponents.input };
const commits = new Map<string, number>();
const onRender: ProfilerOnRenderCallback = (id) => commits.set(id, (commits.get(id) ?? 0) + 1);
function Probe({ block, blockId, index }: BlockProps) {
  const inner = { ...(block.block as Json), block_id: blockId };
  const Inner = inner.type === "input" ? BuiltIn.input : BuiltIn.actions;
  return (
    <Profiler id={blockId} onRender={onRender}>
      {Inner && <Inner block={inner} blockId={blockId} index={index} />}
    </Profiler>
  );
}
blockComponents.probe = Probe;
afterAll(() => {
  delete blockComponents.probe;
});

beforeEach(() => commits.clear());
afterEach(cleanup);

function checkboxesBlocks(count: number) {
  return Array.from({ length: count }, (_, b) => ({
    type: "probe",
    block_id: `b${b}`,
    block: {
      type: "actions",
      elements: [
        {
          type: "checkboxes",
          action_id: "pick",
          options: Array.from({ length: 10 }, (_option, o) => ({
            text: { type: "mrkdwn", text: `Block ${b} option *${o}*` },
            value: `v${o}`,
          })),
        },
      ],
    },
  }));
}

/** Which probes committed since the counts were cleared. */
function rendered() {
  return [...commits.keys()].toSorted();
}

describe("re-renders after an interaction", () => {
  it("re-renders only the block a checkbox was clicked in", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <Message blocks={checkboxesBlocks(20) as never} />
      </BlockKitProvider>,
    );
    commits.clear();

    await clickAsync(screen.getAllByRole("checkbox")[53] as HTMLElement);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]?.[0]).toMatchObject({ block_id: "b5", action_id: "pick" });
    expect(rendered()).toEqual(["b5"]);
  });

  it("re-renders only the input typed in, inside a modal", async () => {
    const blocks = Array.from({ length: 10 }, (_, b) => ({
      type: "probe",
      block_id: `i${b}`,
      block: {
        type: "input",
        label: { type: "plain_text", text: `Field ${b}` },
        element: { type: "plain_text_input", action_id: "text" },
      },
    }));
    const onSubmit = vi.fn();
    render(
      <BlockKitProvider surface="modal" onSubmit={onSubmit}>
        <Modal
          view={{
            type: "modal",
            title: { type: "plain_text", text: "Form" },
            submit: { type: "plain_text", text: "Save" },
            blocks: blocks as never,
          }}
        />
      </BlockKitProvider>,
    );
    commits.clear();

    act(() => {
      fireEvent.change(screen.getAllByRole("textbox")[3] as HTMLElement, {
        target: { value: "hello" },
      });
    });
    expect(rendered()).toEqual(["i3"]);

    await clickAsync(screen.getByRole("button", { name: "Save" }));
    const values = onSubmit.mock.calls[0]?.[0].view.state.values;
    expect(values.i3.text).toEqual({ type: "plain_text_input", value: "hello" });
    expect(values.i4.text).toEqual({ type: "plain_text_input", value: null });
  });

  it("still re-renders a component that reads state from useBlockKit", async () => {
    const seen: StateValues[] = [];
    function StateReader() {
      seen.push(useBlockKit().state);
      return null;
    }
    render(
      <BlockKitProvider>
        <StateReader />
        <Message blocks={checkboxesBlocks(2) as never} />
      </BlockKitProvider>,
    );

    await clickAsync(screen.getAllByRole("checkbox")[12] as HTMLElement);

    expect(seen.at(-1)?.b1?.pick).toMatchObject({
      type: "checkboxes",
      selected_options: [{ value: "v2" }],
    });
  });
});
