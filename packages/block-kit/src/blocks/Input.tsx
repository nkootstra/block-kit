import type { InputBlock } from "@slack/types";
import { useEffect, useId } from "react";
import { SuppressActions, useBlockKit } from "../context";
import { Element } from "../elements/Element";
import { emptyState } from "../elements/emptyState";
import {
  InputBlockContext,
  InputErrorContext,
  InputOptionalContext,
} from "../elements/inputBlockContext";
import { ReturnIcon } from "../icons";
import { Text } from "../Text";
import type { BlockProps, Json } from "../types";

/** Slack's Builder preview adds a "Press 'enter' to submit" hint below a single-line plain text
 * input whose owning `input` block dispatches on the (default) `on_enter_pressed` trigger; with
 * the block's own `hint`, both share one line. Nothing is added for `on_character_entered`-only
 * dispatch, for multiline inputs (Enter inserts a newline there), or for number, URL and email
 * inputs, which dispatch on Enter without it (extra/payloads/dispatch-inputs). */
function dispatchHint(block: InputBlock): boolean {
  if (block.dispatch_action !== true) return false;
  const element = block.element as Json;
  if (element.type !== "plain_text_input") return false;
  if (element.multiline === true) return false;
  const config = element.dispatch_action_config as { trigger_actions_on?: string[] } | undefined;
  const triggers = config?.trigger_actions_on ?? ["on_enter_pressed"];
  return triggers.includes("on_enter_pressed");
}

/**
 * Slack's form field wrapper: label (+"(optional)" suffix), the element itself, an optional hint
 * below it, and a validation error (from `errors[block_id]`, as returned by `response_action:
 * "errors"`) shown in red beneath everything. Without `dispatch_action` the element sends no
 * `block_actions`, as in Slack. The flag is also stamped onto the element as an internal
 * `__dispatchAction` field, since text inputs need it to pick their triggers.
 */
export function Input({ block, blockId }: BlockProps<InputBlock>) {
  const { errors, surface, seedValue } = useBlockKit();
  const element = { ...(block.element as Json), __dispatchAction: block.dispatch_action === true };
  // In a view, Slack's state lists every input, an untouched one with its empty value. Effects run
  // children first, so an element's initial value is already recorded and this only fills a gap.
  const elementType = (block.element as { type: string }).type;
  const actionId = (block.element as { action_id?: string }).action_id ?? "";
  useEffect(() => {
    if (surface === "message") return;
    const empty = emptyState(elementType);
    if (empty) seedValue(blockId, actionId, empty);
  }, [surface, elementType, blockId, actionId, seedValue]);
  const error = errors[blockId];
  const errorId = useId();
  const showDispatchHint = dispatchHint(block);
  // Slack's Builder preview never shows the "(optional)" suffix on the message-surface preview
  // (an `input` block there only ever appears inside a workflow step, where it's implied); it
  // only renders it for a modal/Home tab form.
  const showOptional = block.optional && surface !== "message";

  return (
    <div className={`sbk-input${error ? " sbk-input--error" : ""}`}>
      <div className="sbk-input__label">
        <Text text={block.label} />
        {showOptional && <span className="sbk-input__optional"> (optional)</span>}
      </div>
      <div className="sbk-input__element">
        <InputBlockContext.Provider value={true}>
          <InputOptionalContext.Provider value={block.optional === true}>
            <InputErrorContext.Provider value={error ? errorId : undefined}>
              {block.dispatch_action === true ? (
                <Element element={element} blockId={blockId} />
              ) : (
                <SuppressActions>
                  <Element element={element} blockId={blockId} />
                </SuppressActions>
              )}
            </InputErrorContext.Provider>
          </InputOptionalContext.Provider>
        </InputBlockContext.Provider>
      </div>
      {(block.hint || showDispatchHint) && (
        <div className="sbk-input__hint">
          {block.hint && (
            <span className="sbk-input__hint-text">
              <Text text={block.hint} />
              {/* Slack ends the hint with a period when the enter hint follows it. */}
              {showDispatchHint && !block.hint.text.trimEnd().endsWith(".") && "."}
            </span>
          )}
          {showDispatchHint && (
            <>
              {block.hint && " "}
              <span className="sbk-input__hint-text sbk-input__hint-text--dispatch">
                <span className="sbk-input__hint-icon">
                  <ReturnIcon />
                </span>{" "}
                Press 'enter' to submit
              </span>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="sbk-input__error" id={errorId}>
          {error}
        </div>
      )}
    </div>
  );
}
