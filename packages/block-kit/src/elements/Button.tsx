import { asObject, asString, classModifier } from "../payloadValues";
import type { Button as ButtonElement, PlainTextElement } from "@slack/types";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { safeUrl } from "../safeUrl";
import type { ElementProps } from "../types";
import { BUTTON_LABEL_MAX, truncate } from "./truncate";

export function Button({ element, blockId }: ElementProps<ButtonElement>) {
  const { dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const text = asObject<PlainTextElement>(element.text);
  const className = ["sbk-button", classModifier(element.style) && `sbk-button--${element.style}`]
    .filter(Boolean)
    .join(" ");

  const handleClick = async () => {
    if (!(await ask())) return;
    dispatch({
      type: "button",
      action_id: element.action_id ?? "",
      block_id: blockId,
      text: { type: "plain_text", text: text?.text, emoji: text?.emoji ?? true },
      ...(element.value !== undefined ? { value: element.value } : {}),
      ...(element.url !== undefined ? { url: element.url } : {}),
      ...(element.style !== undefined ? { style: element.style } : {}),
      // Slack echoes the button's confirm dialog back in the action.
      ...(element.confirm ? { confirm: element.confirm } : {}),
    });
    // The action still carries the url, as Slack's does; only a safe one opens.
    const url = safeUrl(element.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        aria-label={element.accessibility_label}
      >
        <span className="sbk-button__label">
          {truncate(asString(text?.text) ?? "", BUTTON_LABEL_MAX)}
        </span>
      </button>
      {dialog}
    </>
  );
}
