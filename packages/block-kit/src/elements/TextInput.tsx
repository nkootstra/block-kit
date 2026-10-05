import { useEffect, useState } from "react";
import { useBlockKit } from "../context";
import { EmailIcon, LinkGlyphIcon } from "../icons";
import type { ElementProps, Json } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";

export interface TextInputElement extends Json {
  type: "plain_text_input" | "email_text_input" | "url_text_input" | "number_input";
  action_id?: string;
  initial_value?: string;
  placeholder?: { type: "plain_text"; text: string };
  multiline?: boolean;
  min_length?: number;
  max_length?: number;
  is_decimal_allowed?: boolean;
  min_value?: string;
  max_value?: string;
  dispatch_action_config?: { trigger_actions_on?: ("on_enter_pressed" | "on_character_entered")[] };
  /** Set by the owning `input` block (Slack's block-level `dispatch_action` flag); not part of
   * the Block Kit element schema, so it's read via an internal field rather than exported. */
  __dispatchAction?: boolean;
}

const HTML_TYPE: Record<TextInputElement["type"], string> = {
  plain_text_input: "text",
  email_text_input: "email",
  url_text_input: "url",
  number_input: "text",
};

export function TextInput({ element, blockId }: ElementProps<TextInputElement>) {
  const { setValue, dispatch, surface } = useBlockKit();
  // Slack's Builder uses a taller "medium" control (36px, more horizontal padding) for a modal
  // or Home tab form; the message-surface preview uses a smaller 28px control.
  const sizeClass = surface === "message" ? "" : " sbk-text-input--medium";
  const [value, setLocalValue] = useState(element.initial_value ?? "");
  const invalid = useInvalidProps();
  const focusRef = useFocusOnLoad<HTMLInputElement & HTMLTextAreaElement>(
    element as { focus_on_load?: boolean },
  );
  const actionId = element.action_id ?? "";
  const dispatchEnabled = element.__dispatchAction === true;
  const triggers = element.dispatch_action_config?.trigger_actions_on ?? ["on_enter_pressed"];

  useEffect(() => {
    if (element.initial_value !== undefined) {
      setValue(blockId, actionId, { type: element.type, value: element.initial_value });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function report(next: string) {
    setValue(blockId, actionId, { type: element.type, value: next });
  }

  function fire(next: string) {
    dispatch({ type: element.type, action_id: actionId, block_id: blockId, value: next });
  }

  function onChange(next: string) {
    if (element.type === "number_input") {
      const pattern = element.is_decimal_allowed ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
      if (next !== "" && !pattern.test(next)) return;
    }
    setLocalValue(next);
    report(next);
    if (dispatchEnabled && triggers.includes("on_character_entered")) fire(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (
      e.key === "Enter" &&
      !element.multiline &&
      dispatchEnabled &&
      triggers.includes("on_enter_pressed")
    ) {
      fire(value);
    }
  }

  // Slack's Builder preview shows this default placeholder for any text-like input that doesn't
  // specify its own, rather than leaving the field visually empty.
  const placeholder = element.placeholder?.text ?? "Write something";

  const commonProps = {
    className: `sbk-text-input${sizeClass}`,
    value,
    placeholder,
    onKeyDown,
    ref: focusRef,
    "aria-label": element.action_id,
    ...invalid,
  };

  // Slack's Builder prefixes email/url inputs with a small leading glyph (envelope / link) inside
  // the closed control, before the placeholder or value.
  const leadingIcon =
    element.type === "email_text_input" ? (
      <EmailIcon className="sbk-text-input__icon" />
    ) : element.type === "url_text_input" ? (
      <LinkGlyphIcon className="sbk-text-input__icon" />
    ) : null;

  if (element.multiline) {
    return (
      <textarea
        {...commonProps}
        className={`sbk-text-input sbk-text-input--multiline${sizeClass}`}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const input = (
    <input
      {...commonProps}
      type={HTML_TYPE[element.type]}
      inputMode={
        element.type === "number_input"
          ? element.is_decimal_allowed
            ? "decimal"
            : "numeric"
          : undefined
      }
      minLength={element.min_length}
      maxLength={element.max_length}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  if (!leadingIcon) return input;

  return (
    <div className="sbk-text-input__wrap">
      {leadingIcon}
      {input}
    </div>
  );
}
