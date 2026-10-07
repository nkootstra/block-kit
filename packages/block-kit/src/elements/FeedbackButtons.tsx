import type { FeedbackButtons as FeedbackButtonsElement } from "@slack/types";
import { type KeyboardEvent, useRef, useState } from "react";
import { useBlockKit } from "../context";
import { ThumbsDownFilledIcon, ThumbsDownIcon, ThumbsUpFilledIcon, ThumbsUpIcon } from "../icons";
import { Tooltip } from "../Tooltip";
import type { ElementProps } from "../types";

type Kind = "positive" | "negative";

/**
 * Positive/negative feedback buttons, as seen on AI agent messages. As in Slack, the pair is a
 * radio group labelled "Rating": the picked button stays checked and shows a filled thumb, picking
 * it again sends the action again, and the arrow keys move and pick. Slack keeps feedback out of
 * `state.values`.
 */
export function FeedbackButtons({ element, blockId }: ElementProps<FeedbackButtonsElement>) {
  const { dispatch } = useBlockKit();
  const [picked, setPicked] = useState<Kind | undefined>();
  const refs = {
    positive: useRef<HTMLButtonElement>(null),
    negative: useRef<HTMLButtonElement>(null),
  };
  const actionId = element.action_id ?? "";

  function choose(kind: Kind) {
    setPicked(kind);
    const button = kind === "positive" ? element.positive_button : element.negative_button;
    dispatch({
      type: "feedback_buttons",
      action_id: actionId,
      block_id: blockId,
      value: button.value,
      text: { type: "plain_text", text: button.text.text },
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next: Kind =
      picked === "positive" || (!picked && e.currentTarget === refs.positive.current)
        ? "negative"
        : "positive";
    choose(next);
    refs[next].current?.focus();
  }

  // The checked button is the group's tab stop; before a pick, the first one is.
  const tabStop: Kind = picked ?? "positive";

  function button(kind: Kind) {
    const spec = kind === "positive" ? element.positive_button : element.negative_button;
    const checked = picked === kind;
    const Icon =
      kind === "positive"
        ? checked
          ? ThumbsUpFilledIcon
          : ThumbsUpIcon
        : checked
          ? ThumbsDownFilledIcon
          : ThumbsDownIcon;
    return (
      <Tooltip label={spec.text.text}>
        <button
          ref={refs[kind]}
          type="button"
          role="radio"
          className="sbk-icon-button"
          onClick={() => choose(kind)}
          onKeyDown={onKeyDown}
          aria-label={spec.accessibility_label ?? spec.text.text}
          aria-checked={checked}
          tabIndex={tabStop === kind ? 0 : -1}
        >
          <Icon />
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="sbk-feedback-buttons" role="radiogroup" aria-label="Rating">
      {button("positive")}
      {button("negative")}
    </div>
  );
}
