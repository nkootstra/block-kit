import type { RichTextBlock, RichTextInput as RichTextInputElement } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useBlockKit } from "../context";
import type { ElementProps } from "../types";
import { RichTextComposerActions, RichTextToolbar } from "./RichTextToolbar";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";

/** Wraps plain text into the `rich_text` block shape Slack uses for this element's value. The
 * editor is plain text; Slack's formatting bar and composer row are drawn around it for parity. */
function toRichText(text: string): RichTextBlock {
  return {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function fromRichText(value: RichTextBlock | undefined): string {
  if (!value) return "";
  return (value.elements as unknown[])
    .flatMap((section) => {
      const node = section as { elements?: unknown[] };
      return node.elements ?? [];
    })
    .map((el: unknown) => {
      const node = el as { text?: unknown };
      return typeof node.text === "string" ? node.text : "";
    })
    .join("");
}

export function RichTextInput({ element, blockId }: ElementProps<RichTextInputElement>) {
  const { setValue, dispatch } = useBlockKit();
  const ref = useRef<HTMLDivElement>(null);
  useFocusOnLoad(element, ref);
  const invalid = useInvalidProps();
  const actionId = element.action_id ?? "";
  const initialText = fromRichText(element.initial_value);
  const [formatting, setFormatting] = useState(true);
  const [empty, setEmpty] = useState(initialText === "");

  useEffect(() => {
    if (element.initial_value) {
      setValue(blockId, actionId, {
        type: "rich_text_input",
        rich_text_value: element.initial_value,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onInput() {
    const text = ref.current?.innerText ?? "";
    setEmpty(text.trim() === "");
    const richText = toRichText(text);
    setValue(blockId, actionId, { type: "rich_text_input", rich_text_value: richText });
    dispatch({
      type: "rich_text_input",
      action_id: actionId,
      block_id: blockId,
      rich_text_value: richText,
    });
  }

  const placeholder = element.placeholder?.text;
  return (
    <div className="sbk-rich-text-input">
      {formatting && <RichTextToolbar />}
      <div className="sbk-rich-text-input__body">
        <div
          ref={ref}
          className="sbk-rich-text-input__editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          {...invalid}
          aria-label={placeholder ?? actionId}
          onInput={onInput}
          style={{
            minHeight: element.min_lines ? `${element.min_lines * 22}px` : undefined,
            maxHeight: element.max_lines ? `${element.max_lines * 22}px` : undefined,
          }}
        >
          {initialText}
        </div>
        {/* A real element, as Slack's `ql-placeholder` is, so it's text on the page. */}
        {placeholder && empty && (
          <div className="sbk-rich-text-input__placeholder" aria-hidden="true">
            {placeholder}
          </div>
        )}
      </div>
      <RichTextComposerActions
        formatting={formatting}
        onToggleFormatting={() => setFormatting((shown) => !shown)}
      />
    </div>
  );
}
