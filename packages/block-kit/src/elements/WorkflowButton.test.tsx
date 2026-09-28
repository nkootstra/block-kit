import type { WorkflowButton as WorkflowButtonElement } from "@slack/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { clickAsync } from "./test-utils";
import { WorkflowButton } from "./WorkflowButton";

afterEach(cleanup);

describe("<WorkflowButton>", () => {
  it("dispatches a workflow_button action with the workflow metadata and action_id", async () => {
    const onAction = vi.fn();
    const workflow = { trigger: { url: "https://slack.com/shortcuts/Ft0/abc" } };
    render(
      <BlockKitProvider onAction={onAction}>
        <WorkflowButton
          element={
            {
              type: "workflow_button",
              action_id: "wf1",
              text: { type: "plain_text", text: "Run workflow", emoji: true },
              workflow,
              style: "primary",
            } as unknown as WorkflowButtonElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Run workflow" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workflow_button",
        action_id: "wf1",
        block_id: "b1",
        workflow,
        style: "primary",
        text: { type: "plain_text", text: "Run workflow", emoji: true },
      }),
      expect.anything(),
    );
  });

  it("falls back to an empty action_id when none is set", async () => {
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction}>
        <WorkflowButton
          element={
            {
              type: "workflow_button",
              text: { type: "plain_text", text: "Go" },
              workflow: {},
            } as unknown as WorkflowButtonElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    await clickAsync(screen.getByRole("button", { name: "Go" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action_id: "" }),
      expect.anything(),
    );
  });
});
