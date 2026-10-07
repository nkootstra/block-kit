import { useEffect, useId, useRef, useState } from "react";
import { useBlockKit } from "../context";
import { CHARACTER_DISPATCH_DELAY } from "./characterDispatch";
import { EmailIcon, LinkGlyphIcon } from "../icons";
import type { ElementProps, Json } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useClientLayoutEffect } from "../useClientLayoutEffect";
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

/** The Builder's placeholder for a field that sets none. Slack's email default isn't recorded yet. */
const DEFAULT_PLACEHOLDER: Record<TextInputElement["type"], string> = {
  plain_text_input: "Write something",
  email_text_input: "Write something",
  url_text_input: "Enter a URL",
  number_input: "Enter a number",
};

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
    clearTimeout(typing.current);
    dispatch({ type: element.type, action_id: actionId, block_id: blockId, value: next });
  }

  // on_character_entered: one action with the full value once typing pauses, as Slack coalesces
  // keystrokes. An Enter dispatch sends at once and drops the pending one.
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(typing.current), []);
  function fireAfterPause(next: string) {
    clearTimeout(typing.current);
    typing.current = setTimeout(() => fire(next), CHARACTER_DISPATCH_DELAY);
  }

  function onChange(next: string) {
    if (element.type === "number_input") {
      const pattern = element.is_decimal_allowed ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
      if (next !== "" && !pattern.test(next)) return;
    }
    setLocalValue(next);
    report(next);
    if (dispatchEnabled && triggers.includes("on_character_entered")) fireAfterPause(next);
  }

  // Slack doesn't cut typing off at max_length: it counts the characters left inside the field,
  // below zero past the limit, and marks the field invalid there or under min_length (once
  // something is typed). Enter sends nothing while the text is out of bounds.
  const length = [...value].length;
  const tooLong = element.max_length !== undefined && length > element.max_length;
  const tooShort = element.min_length !== undefined && length > 0 && length < element.min_length;
  const outOfBounds = tooLong || tooShort;
  const remaining =
    element.max_length !== undefined && length > 0 ? element.max_length - length : undefined;
  // Slack widens the field's right padding to the count's width, so text never runs under it.
  const countRef = useRef<HTMLSpanElement>(null);
  const [countWidth, setCountWidth] = useState<number | undefined>(undefined);
  useClientLayoutEffect(() => {
    setCountWidth(countRef.current?.getBoundingClientRect().width);
  }, [remaining]);
  const countId = useId();

  function onKeyDown(e: React.KeyboardEvent) {
    if (
      e.key === "Enter" &&
      !element.multiline &&
      dispatchEnabled &&
      triggers.includes("on_enter_pressed") &&
      !outOfBounds
    ) {
      fire(value);
    }
  }

  // Slack's Builder preview shows a default placeholder for any text-like input that doesn't
  // specify its own, rather than leaving the field visually empty.
  const placeholder = element.placeholder?.text ?? DEFAULT_PLACEHOLDER[element.type];

  const invalidDescribed = invalid["aria-describedby"];
  const commonProps = {
    className: `sbk-text-input${sizeClass}${remaining !== undefined ? " sbk-text-input--counted" : ""}`,
    value,
    placeholder,
    onKeyDown,
    ref: focusRef,
    "aria-label": element.action_id,
    ...invalid,
    ...(outOfBounds ? { "aria-invalid": true as const } : {}),
    ...(remaining !== undefined
      ? {
          "aria-describedby": [invalidDescribed, countId].filter(Boolean).join(" "),
          style: countWidth !== undefined ? { paddingRight: countWidth } : undefined,
        }
      : {}),
  };

  // The visible count is the bare number; screen readers get "N characters remaining" through
  // aria-describedby, as in Slack.
  const count =
    remaining !== undefined ? (
      <>
        <span
          ref={countRef}
          className={`sbk-text-input__count${remaining < 0 ? " sbk-text-input__count--over" : ""}`}
          aria-hidden="true"
        >
          {remaining}
        </span>
        <span id={countId} className="sbk-visually-hidden">
          {`${remaining} characters remaining`}
        </span>
      </>
    ) : null;

  // Slack's Builder prefixes email/url inputs with a small leading glyph (envelope / link) inside
  // the closed control, before the placeholder or value.
  const leadingIcon =
    element.type === "email_text_input" ? (
      <EmailIcon className="sbk-text-input__icon" />
    ) : element.type === "url_text_input" ? (
      <LinkGlyphIcon className="sbk-text-input__icon" />
    ) : null;

  if (element.multiline) {
    const textarea = (
      <textarea
        {...commonProps}
        className={`${commonProps.className} sbk-text-input--multiline`}
        onChange={(e) => onChange(e.target.value)}
      />
    );
    // Wrapped whenever there's a limit, so the field isn't remounted (losing focus) when the
    // counter first appears.
    return element.max_length !== undefined ? (
      <div className="sbk-text-input__wrap sbk-text-input__wrap--multiline">
        {textarea}
        {count}
      </div>
    ) : (
      textarea
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
      onChange={(e) => onChange(e.target.value)}
    />
  );

  if (!leadingIcon && element.max_length === undefined) return input;

  return (
    <div className={`sbk-text-input__wrap${leadingIcon ? " sbk-text-input__wrap--icon" : ""}`}>
      {leadingIcon}
      {input}
      {count}
    </div>
  );
}
