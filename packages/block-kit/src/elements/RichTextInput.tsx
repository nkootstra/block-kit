import type { RichTextBlock, RichTextInput as RichTextInputElement } from "@slack/types";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useBlockKit } from "../context";
import type { ElementProps } from "../types";
import { useClientLayoutEffect } from "../useClientLayoutEffect";
import { CHARACTER_DISPATCH_DELAY } from "./characterDispatch";
import { RichTextComposerActions, RichTextToolbar } from "./RichTextToolbar";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";
import { firstText, formatsAt, readRichTextValue, renderRichTextValue } from "./richTextValue";

/** Slack's placeholder when the payload sets none (fixtures/contexts/rich_text_input/modal-input). */
const DEFAULT_PLACEHOLDER = "Write something";

/** Whether the value holds nothing to show: no sections with text, and no lists, quotes or code. */
function isBlank(value: RichTextBlock | undefined): boolean {
  return (value?.elements ?? []).every(
    (block) =>
      block.type === "rich_text_section" &&
      block.elements.every((leaf) => leaf.type === "text" && leaf.text.trim() === ""),
  );
}

/** Slack's line height, the editor's top and bottom padding, and the lines it shows before it
 * scrolls when the payload sets no `max_lines` (Slack's field stops at 192px: 8 × 22 + 16). */
const LINE = 22;
const PADDING = 16;
const MAX_LINES = 8;

/** The height of `lines` lines of text, padding included, as the editor's box is border-box. */
function linesHeight(lines: number): string {
  return `${lines * LINE + PADDING}px`;
}

type DispatchConfig = {
  trigger_actions_on?: ("on_enter_pressed" | "on_character_entered")[];
};

export function RichTextInput({ element, blockId }: ElementProps<RichTextInputElement>) {
  const { setValue, dispatch, resolvers, timeZone } = useBlockKit();
  const ref = useRef<HTMLDivElement>(null);
  useFocusOnLoad(element, ref);
  const invalid = useInvalidProps();
  const actionId = element.action_id ?? "";
  // Drawn once: after that the editor's DOM is the user's, and the same element keeps React from
  // touching it on a re-render.
  const [initialContent] = useState(() =>
    renderRichTextValue(element.initial_value, { resolvers, timeZone }),
  );
  const [formatting, setFormatting] = useState(true);
  const [empty, setEmpty] = useState(() => isBlank(element.initial_value));
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());

  // Slack's toolbar shows the formats at the caret as pressed, and before the field is used the
  // caret sits at the start of the value: "Bold" is pressed for a value that opens in bold
  // (fixtures/extra/fidelity/rich-text-input/mixed).
  useClientLayoutEffect(() => {
    const editor = ref.current;
    if (!editor) return;
    setPressed(formatsAt(firstText(editor), editor));
    const onSelection = () => {
      const at = editor.ownerDocument.getSelection()?.anchorNode ?? null;
      if (at && editor.contains(at)) setPressed(formatsAt(at, editor));
    };
    editor.ownerDocument.addEventListener("selectionchange", onSelection);
    return () => editor.ownerDocument.removeEventListener("selectionchange", onSelection);
  }, []);

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
    if (!ref.current) return;
    dispatch({
      type: "rich_text_input",
      action_id: actionId,
      block_id: blockId,
      rich_text_value: readRichTextValue(ref.current),
    });
  }

  function onInput() {
    const editor = ref.current;
    if (!editor) return;
    const value = readRichTextValue(editor);
    setEmpty(isBlank(value));
    setValue(blockId, actionId, { type: "rich_text_input", rich_text_value: value });
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

  const placeholder = element.placeholder?.text ?? DEFAULT_PLACEHOLDER;
  return (
    <div className="sbk-rich-text-input">
      {formatting && <RichTextToolbar pressed={pressed} />}
      <div className="sbk-rich-text-input__body">
        <div
          ref={ref}
          className="sbk-rich-text-input__editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          {...invalid}
          aria-label={element.placeholder?.text ?? actionId}
          onInput={onInput}
          onKeyDown={onKeyDown}
          style={{
            minHeight: element.min_lines ? linesHeight(element.min_lines) : undefined,
            maxHeight: linesHeight(element.max_lines ?? MAX_LINES),
          }}
        >
          {initialContent}
        </div>
        {/* A real element, as Slack's `ql-placeholder` is, so it's text on the page. */}
        {empty && (
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
