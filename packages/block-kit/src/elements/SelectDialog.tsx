import type { PlainTextOption } from "@slack/types";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockKitConfig } from "../context";
import { CloseIcon } from "../icons";
import { Text } from "../Text";
import { MENU_GAP, Popover } from "./Popover";
import { useCombobox } from "./useCombobox";

const optionId = (option: PlainTextOption) => option.value ?? option.text.text;

/**
 * Slack's selection dialog, which a multi-select in a section accessory opens instead of an inline
 * menu, titled with the select's placeholder. The option list stays open while choosing, and each
 * pick reaches the accessory's button at once (`onChange`), as in the Slack client; nothing is sent
 * until Confirm. Escape and the close button keep the picks (`onClose`); Cancel goes back to what
 * the dialog opened with (`onCancel`). Tab stays inside the dialog, and the field opens its list when it takes the focus. A users, conversations or channels select lists its `resolvers.directory` entries, and
 * `addTyped` turns a typed id no entry matches into a chip on Enter. `chipLabel` draws a chip's
 * label in place of its option text when it returns one.
 */
export function SelectDialog({
  options,
  initial,
  placeholder,
  addTyped,
  chipLabel,
  onConfirm,
  onCancel,
  onClose,
  onChange,
}: {
  options: PlainTextOption[];
  initial: PlainTextOption[];
  placeholder: string;
  /** Turns a typed id into a chip on Enter when no listed option matches it. */
  addTyped?: (typed: string) => PlainTextOption;
  /** A chip's label, or `undefined` for its option text. */
  chipLabel?: (option: PlainTextOption) => ReactNode;
  onConfirm: (selected: PlainTextOption[]) => void;
  /** Cancel: back to the picks the dialog opened with. */
  onCancel: () => void;
  /** Escape or the close button: the picks stay, unsent. */
  onClose: () => void;
  /** Every change to the picks, as it happens. */
  onChange?: (selected: PlainTextOption[]) => void;
}) {
  const { theme } = useBlockKitConfig();
  const titleId = useId();
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The latest onChange, so the effect below runs only when the picks change.
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    changed.current?.(draft);
  }, [draft]);

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
    // As in Slack, a click opens the list with nothing highlighted; ArrowDown highlights the first.
    clickedIndex: -1,
    hoverHighlight: false,
    onChoose: (i) => {
      const option = rows[i];
      if (option) toggle(option);
    },
    onSubmitQuery: addTyped
      ? (typed) => {
          const option = addTyped(typed);
          if (!chosen(option)) setDraft((current) => [...current, option]);
          setQuery("");
        }
      : undefined,
    listRef,
  });

  // Focus moves to the dialog once, when it opens. Slack focuses the dialog rather than its field,
  // so the field opens at rest (no focus ring) and Tab moves into it.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Tab stays in the dialog, as in Slack's: past Confirm it wraps to the close button, and
  // Shift+Tab from the close button (or from the dialog itself, as it opens) to Confirm.
  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    const focusable = [
      ...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input"),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    const at = document.activeElement;
    const target = e.shiftKey
      ? at === first || at === e.currentTarget
        ? last
        : undefined
      : at === last
        ? first
        : undefined;
    if (!target) return;
    e.preventDefault();
    target.focus();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="sbk-root sbk-select-dialog__overlay" data-theme={theme}>
      <div
        ref={dialogRef}
        className="sbk-select-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            trapTab(e);
            return;
          }
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      >
        <div className="sbk-select-dialog__header">
          <h2 className="sbk-select-dialog__title" id={titleId}>
            {placeholder}
          </h2>
          <button
            type="button"
            className="sbk-select-dialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="sbk-select-dialog__body">
          <div className="sbk-select-dialog__field" ref={fieldRef}>
            {draft.map((option) => (
              <span className="sbk-select__chip" key={optionId(option)}>
                {chipLabel?.(option) ?? (
                  <span className="sbk-select__chip-label">
                    <span className="sbk-select__chip-text">
                      <span>{option.text.text}</span>
                    </span>
                  </span>
                )}
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
            {draft.length === 0 && query === "" && (
              // Slack draws the placeholder as its own element over the field, not as the input's.
              <span className="sbk-select-dialog__placeholder" aria-hidden="true">
                {placeholder}
              </span>
            )}
            <input
              {...combo.inputProps(undefined, placeholder)}
              // Slack's field opens its list when it takes the focus, with nothing highlighted.
              onFocus={() => {
                if (!combo.open) combo.openAsClicked();
              }}
              placeholder=""
              className="sbk-select-dialog__input"
            />
          </div>
          {combo.open && (
            // Slack opens it like an input block's multi-select list: 12px left of the field, 22px
            // wider, over the field's bottom 4px.
            <Popover
              anchorRef={fieldRef}
              onDismiss={() => combo.setOpen(false)}
              offsetX={-12}
              gap={MENU_GAP}
            >
              <div
                className="sbk-select__menu sbk-select__menu--wide"
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
          {/* Slack's dialog buttons are its 36px modal buttons, not the 28px message ones. */}
          <button type="button" className="sbk-modal__button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="sbk-modal__button sbk-modal__button--primary"
            onClick={() => onConfirm(draft)}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
