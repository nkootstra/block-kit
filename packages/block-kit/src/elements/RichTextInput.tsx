import type { RichTextBlock, RichTextInput as RichTextInputElement } from "@slack/types";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useBlockKit } from "../context";
import type { ElementProps } from "../types";
import { CHARACTER_DISPATCH_DELAY } from "./characterDispatch";
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

type DispatchConfig = {
  trigger_actions_on?: ("on_enter_pressed" | "on_character_entered")[];
};

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

  // Slack's dispatch_action_config, as for text inputs: Enter by default (Shift+Enter still adds
  // a line), or once typing pauses for on_character_entered. Only an input block with
  // dispatch_action lets either through.
  const config = element as { __dispatchAction?: boolean; dispatch_action_config?: DispatchConfig };
  const dispatchEnabled = config.__dispatchAction === true;
  const triggers = config.dispatch_action_config?.trigger_actions_on ?? ["on_enter_pressed"];
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(typing.current), []);

  function fire() {
    clearTimeout(typing.current);
    dispatch({
      type: "rich_text_input",
      action_id: actionId,
      block_id: blockId,
      rich_text_value: toRichText(ref.current?.innerText ?? ""),
    });
  }

  function onInput() {
    const text = ref.current?.innerText ?? "";
    setEmpty(text.trim() === "");
    setValue(blockId, actionId, { type: "rich_text_input", rich_text_value: toRichText(text) });
    if (dispatchEnabled && triggers.includes("on_character_entered")) {
      clearTimeout(typing.current);
      typing.current = setTimeout(fire, CHARACTER_DISPATCH_DELAY);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.shiftKey || !dispatchEnabled) return;
    if (!triggers.includes("on_enter_pressed")) return;
    e.preventDefault();
    fire();
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
          onKeyDown={onKeyDown}
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
