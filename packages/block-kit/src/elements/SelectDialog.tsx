import type { PlainTextOption } from "@slack/types";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "../context";
import { CloseIcon } from "../icons";
import { Text } from "../Text";
import { Popover } from "./Popover";
import { useCombobox } from "./useCombobox";

const optionId = (option: PlainTextOption) => option.value ?? option.text.text;

/**
 * Slack's "Select options" dialog, which a `multi_static_select` in a section accessory opens
 * instead of an inline menu. Picks are a draft: the option list stays open while choosing, and
 * nothing is sent until Confirm. Cancel, the close button and Escape discard the draft.
 */
export function SelectDialog({
  options,
  initial,
  placeholder,
  onConfirm,
  onCancel,
}: {
  options: PlainTextOption[];
  initial: PlainTextOption[];
  placeholder: string;
  onConfirm: (selected: PlainTextOption[]) => void;
  onCancel: () => void;
}) {
  const { theme } = useBlockKit();
  const titleId = useId();
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState("");
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = options.filter((o) => o.text.text.toLowerCase().includes(query.toLowerCase()));
  const chosen = (option: PlainTextOption) => draft.some((d) => optionId(d) === optionId(option));
  const toggle = (option: PlainTextOption) =>
    setDraft((current) =>
      chosen(option)
        ? current.filter((d) => optionId(d) !== optionId(option))
        : [...current, option],
    );

  const combo = useCombobox({
    query,
    onQueryChange: setQuery,
    count: rows.length,
    initialIndex: 0,
    onChoose: (i) => {
      const option = rows[i];
      if (option) toggle(option);
    },
    listRef,
  });

  useEffect(() => {
    combo.inputRef.current?.focus();
    // Focus moves into the dialog once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="sbk-root sbk-select-dialog__overlay" data-theme={theme}>
      <div
        className="sbk-select-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }}
      >
        <div className="sbk-select-dialog__header">
          <h2 className="sbk-select-dialog__title" id={titleId}>
            Select options
          </h2>
          <button
            type="button"
            className="sbk-select-dialog__close"
            aria-label="Close"
            onClick={onCancel}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="sbk-select-dialog__body">
          <div className="sbk-select-dialog__field" ref={fieldRef}>
            {draft.map((option) => (
              <span className="sbk-select__chip" key={optionId(option)}>
                <span className="sbk-select__chip-label">
                  <span className="sbk-select__chip-text">
                    <span>{option.text.text}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="sbk-select__chip-remove"
                  aria-label={`Remove ${option.text.text}`}
                  onClick={() => toggle(option)}
                >
                  <CloseIcon />
                </button>
              </span>
            ))}
            <input
              {...combo.inputProps(undefined, placeholder)}
              placeholder={draft.length > 0 ? "" : placeholder}
              className="sbk-select-dialog__input"
            />
          </div>
          {combo.open && (
            <Popover anchorRef={fieldRef} onDismiss={() => combo.setOpen(false)}>
              <div
                className="sbk-select__menu sbk-select-dialog__menu"
                role="listbox"
                aria-multiselectable="true"
                id={combo.listId}
                ref={listRef}
              >
                {rows.map((option, i) => (
                  <div
                    key={optionId(option)}
                    role="option"
                    aria-selected={chosen(option)}
                    className={`sbk-select__option${chosen(option) ? " sbk-select__option--selected" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(option)}
                    {...combo.optionProps(i)}
                  >
                    <span className="sbk-select__option-text">
                      <Text text={option.text} />
                    </span>
                  </div>
                ))}
              </div>
            </Popover>
          )}
        </div>
        <div className="sbk-select-dialog__footer">
          <button type="button" className="sbk-button" onClick={onCancel}>
            <span className="sbk-button__label">Cancel</span>
          </button>
          <button
            type="button"
            className="sbk-button sbk-button--primary"
            onClick={() => onConfirm(draft)}
          >
            <span className="sbk-button__label">Confirm</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
