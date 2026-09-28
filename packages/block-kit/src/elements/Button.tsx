import type { Button as ButtonElement } from "@slack/types";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import type { ElementProps } from "../types";

export function Button({ element, blockId }: ElementProps<ButtonElement>) {
  const { dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const className = ["sbk-button", element.style && `sbk-button--${element.style}`]
    .filter(Boolean)
    .join(" ");

  const handleClick = async () => {
    if (!(await ask())) return;
    dispatch({
      type: "button",
      action_id: element.action_id ?? "",
      block_id: blockId,
      text: { type: "plain_text", text: element.text.text, emoji: element.text.emoji ?? true },
      ...(element.value !== undefined ? { value: element.value } : {}),
      ...(element.url !== undefined ? { url: element.url } : {}),
      ...(element.style !== undefined ? { style: element.style } : {}),
    });
    if (element.url) window.open(element.url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        aria-label={element.accessibility_label}
      >
        <span className="sbk-button__label">{element.text.text}</span>
      </button>
      {dialog}
    </>
  );
}
