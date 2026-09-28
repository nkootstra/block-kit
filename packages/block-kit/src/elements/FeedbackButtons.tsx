import type { FeedbackButtons as FeedbackButtonsElement } from "@slack/types";
import { useState } from "react";
import { useBlockKit } from "../context";
import { ThumbsDownIcon, ThumbsUpIcon } from "../icons";
import { Tooltip } from "../Tooltip";
import type { ElementProps } from "../types";

/** Positive/negative feedback buttons, as seen on AI agent messages. Only one of the two can be
 * picked, matching Slack's own toggle behavior. */
export function FeedbackButtons({ element, blockId }: ElementProps<FeedbackButtonsElement>) {
  const { setValue, dispatch } = useBlockKit();
  const [picked, setPicked] = useState<"positive" | "negative" | undefined>();
  const actionId = element.action_id ?? "";

  function choose(kind: "positive" | "negative") {
    const next = picked === kind ? undefined : kind;
    setPicked(next);
    const button = kind === "positive" ? element.positive_button : element.negative_button;
    setValue(
      blockId,
      actionId,
      next ? { type: "feedback_buttons", value: button.value } : undefined,
    );
    dispatch({
      type: "feedback_buttons",
      action_id: actionId,
      block_id: blockId,
      value: button.value,
      text: { type: "plain_text", text: button.text.text },
    });
  }

  return (
    <div className="sbk-feedback-buttons">
      <Tooltip label={element.positive_button.text.text}>
        <button
          type="button"
          className={`sbk-icon-button${picked === "positive" ? " sbk-icon-button--active" : ""}`}
          onClick={() => choose("positive")}
          aria-label={
            element.positive_button.accessibility_label ?? element.positive_button.text.text
          }
          aria-pressed={picked === "positive"}
        >
          <ThumbsUpIcon />
        </button>
      </Tooltip>
      <Tooltip label={element.negative_button.text.text}>
        <button
          type="button"
          className={`sbk-icon-button${picked === "negative" ? " sbk-icon-button--active" : ""}`}
          onClick={() => choose("negative")}
          aria-label={
            element.negative_button.accessibility_label ?? element.negative_button.text.text
          }
          aria-pressed={picked === "negative"}
        >
          <ThumbsDownIcon />
        </button>
      </Tooltip>
    </div>
  );
}
