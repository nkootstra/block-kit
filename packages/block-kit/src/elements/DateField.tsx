import { useRef, useState } from "react";
import { CalendarIcon, ChevronDownIcon } from "../icons";
import { focusCalendarDay } from "./calendar/CalendarPopover";
import { parseTypedDate } from "./dateFormat";
import type { useInvalidProps } from "./inputBlockContext";
import type { useFocusOnLoad } from "./useFocusOnLoad";

interface DateFieldOptions {
  /** The field, as `useFocusOnLoad` returns it. */
  inputRef: ReturnType<typeof useFocusOnLoad<HTMLInputElement>>;
  /** The element's `focus_on_load`: that first focus leaves the calendar closed. */
  focusOnLoad: boolean | undefined;
  /** The chosen date as the field shows it, or "" while there's none. */
  display: string;
  /** A typed date that reads as one (`YYYY-MM-DD`), taken on Enter or as focus leaves. */
  onType: (date: string) => void | Promise<void>;
}

/**
 * Slack's date field (`c-date_picker__select_input`), shared by the datepicker and the
 * datetimepicker's date half: a text input that opens the calendar on a press, selects its date
 * when tabbed into, and takes a typed date. The caller renders the calendar with `popoverProps`.
 */
export function useDateField({ inputRef, focusOnLoad, display, onType }: DateFieldOptions) {
  const [open, setOpen] = useState(false);
  // Focus given by `focus_on_load`, or handed back as the calendar closes, shouldn't pop the
  // calendar open; a user's focus does.
  const quietFocus = useRef(focusOnLoad === true);
  // Opened with the pointer or a key, the calendar takes focus on its selected day, as Slack's
  // does. Opened by tabbing into the field, it leaves focus there so Tab keeps moving through the
  // form; ArrowDown then moves into the calendar.
  const focusCalendar = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);
  // What's typed into the field, while it differs from the chosen date; null shows the date.
  const [text, setText] = useState<string | null>(null);

  function focusDay() {
    focusCalendarDay(popupRef.current);
  }

  /** Closes the calendar and hands focus back to the field, without reopening it. */
  function close() {
    setOpen(false);
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    quietFocus.current = true;
    input.focus();
  }

  /**
   * A typed date: Enter or leaving the field takes it, as Slack's field does, and anything that
   * isn't a date is ignored. The calendar stays open after Enter, as in Slack.
   */
  async function takeTyped(): Promise<void> {
    if (text === null) return;
    const next = parseTypedDate(text);
    if (next) await onType(next);
  }

  const inputProps = {
    type: "text",
    autoComplete: "off",
    spellCheck: false,
    value: text ?? display,
    "aria-label": "Date",
    ref: inputRef,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
      setOpen(true);
    },
    // A press opens the calendar; tabbing in selects the date and leaves it closed, as Slack's
    // field does (`catalog/actions/datepickers@focus-field-1`). Typing or ArrowDown opens it.
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      if (quietFocus.current) quietFocus.current = false;
      else if (focusCalendar.current) setOpen(true);
      else e.currentTarget.select();
    },
    onBlur: async () => {
      await takeTyped();
      setText(null);
    },
    // A press focuses the field before its click, so mark the pointer on the way down.
    onMouseDown: () => {
      focusCalendar.current = true;
    },
    onClick: () => {
      if (open) focusDay();
      else focusCalendar.current = true;
      setOpen(true);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setText(null);
        setOpen(false);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void takeTyped();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (open) focusDay();
        else {
          focusCalendar.current = true;
          setOpen(true);
        }
      }
    },
  };

  function toggle() {
    focusCalendar.current = true;
    if (open) focusDay();
    else setOpen(true);
  }

  const popoverProps = {
    popupRef,
    onDismiss: () => setOpen(false),
    onEscape: close,
    focusOnOpen: () => {
      const focus = focusCalendar.current;
      focusCalendar.current = false;
      return focus;
    },
  };

  return { open, setOpen, close, inputProps, toggle, popoverProps };
}

interface DateFieldProps {
  field: ReturnType<typeof useDateField>;
  placeholder: string;
  /** `aria-invalid` and friends while an input block shows an error. */
  invalid?: ReturnType<typeof useInvalidProps>;
}

/** The field's calendar glyph, text input and chevron button, as Slack's `c-input_text_icon`. */
export function DateField({ field, placeholder, invalid }: DateFieldProps) {
  return (
    <div className="sbk-datepicker__input_wrap">
      <CalendarIcon className="sbk-datepicker__icon" />
      <input
        className="sbk-datepicker__input"
        placeholder={placeholder}
        {...invalid}
        {...field.inputProps}
      />
      {/* Slack's `c-date_picker__select_btn`: its own button, after the field in the tab order. */}
      <button
        type="button"
        className="sbk-datepicker__toggle"
        aria-label="Open calendar"
        onClick={field.toggle}
      >
        <ChevronDownIcon className="sbk-datepicker__chevron" />
      </button>
    </div>
  );
}
