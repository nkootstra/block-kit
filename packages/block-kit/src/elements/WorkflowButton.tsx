import type { WorkflowButton as WorkflowButtonElement } from "@slack/types";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { WorkflowIcon } from "../icons";
import type { ElementProps } from "../types";

/** Renders like a regular button with a small lightning-bolt glyph, matching Slack's own
 * workflow_button treatment. There is no real workflow runtime here: clicking only dispatches
 * the block_actions payload with the workflow's trigger metadata, it never calls the trigger URL. */
export function WorkflowButton({ element, blockId }: ElementProps<WorkflowButtonElement>) {
  const { dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const className = [
    "sbk-button",
    "sbk-workflow-button",
    element.style && `sbk-button--${element.style}`,
  ]
    .filter(Boolean)
    .join(" ");

  // @slack/types omits `action_id` from WorkflowButton, but Slack's real payloads include it.
  const actionId = (element as unknown as { action_id?: string }).action_id ?? "";

  const handleClick = async () => {
    if (!(await ask())) return;
    dispatch({
      type: "workflow_button",
      action_id: actionId,
      block_id: blockId,
      text: { type: "plain_text", text: element.text.text, emoji: element.text.emoji ?? true },
      workflow: element.workflow,
      ...(element.style !== undefined ? { style: element.style } : {}),
    });
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        aria-label={element.accessibility_label}
      >
        <WorkflowIcon className="sbk-workflow-button__icon" />
        <span className="sbk-button__label">{element.text.text}</span>
      </button>
      {dialog}
    </>
  );
}
