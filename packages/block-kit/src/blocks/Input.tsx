import type { InputBlock } from "@slack/types";
import { useId } from "react";
import { SuppressActions, useBlockKit } from "../context";
import { Element } from "../elements/Element";
import { InputBlockContext, InputErrorContext } from "../elements/inputBlockContext";
import { ReturnIcon } from "../icons";
import { Text } from "../Text";
import type { BlockProps, Json } from "../types";

const TEXT_INPUT_TYPES = new Set([
  "plain_text_input",
  "email_text_input",
  "url_text_input",
  "number_input",
]);

/** Slack's Builder preview synthesizes a "Press 'enter' to submit" hint below a single-line text
 * input whose owning `input` block dispatches on the (default) `on_enter_pressed` trigger, when
 * the block doesn't already carry its own explicit `hint`. It does NOT synthesize anything for
 * `on_character_entered`-only dispatch, or for multiline inputs (Enter inserts a newline there). */
function dispatchHint(block: InputBlock): boolean {
  if (block.dispatch_action !== true || block.hint) return false;
  const element = block.element as Json;
  if (typeof element.type !== "string" || !TEXT_INPUT_TYPES.has(element.type)) return false;
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
  const { errors, surface } = useBlockKit();
  const element = { ...(block.element as Json), __dispatchAction: block.dispatch_action === true };
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
          <InputErrorContext.Provider value={error ? errorId : undefined}>
            {block.dispatch_action === true ? (
              <Element element={element} blockId={blockId} />
            ) : (
              <SuppressActions>
                <Element element={element} blockId={blockId} />
              </SuppressActions>
            )}
          </InputErrorContext.Provider>
        </InputBlockContext.Provider>
      </div>
      {block.hint && (
        <div className="sbk-input__hint">
          <span className="sbk-input__hint-text">
            <Text text={block.hint} />
          </span>
        </div>
      )}
      {showDispatchHint && (
        <div className="sbk-input__hint">
          <span className="sbk-input__hint-text sbk-input__hint-text--dispatch">
            <span className="sbk-input__hint-icon">
              <ReturnIcon />
            </span>{" "}
            Press 'enter' to submit
          </span>
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
