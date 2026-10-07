import type { Datepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { CalendarIcon, ChevronDownIcon } from "../icons";
import type { ElementProps } from "../types";
import { CalendarPopover, focusCalendarDay } from "./calendar/CalendarPopover";
import { ordinal, parseTypedDate } from "./dateFormat";
import { useInInputBlock, useInOptionalInput, useInvalidProps } from "./inputBlockContext";
import { useFocusOnLoad } from "./useFocusOnLoad";

/**
 * Formats `YYYY-MM-DD` the way Slack's closed datepicker control shows it: "04/28/1990" in an
 * actions block or section accessory, and "April 28th, 1990" in an `input` block.
 */
function formatDate(date: string, long: boolean): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  if (long) {
    const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
      month: "long",
      timeZone: "UTC",
    });
    return `${month} ${ordinal(d)}, ${y}`;
  }
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

export function DatePicker({ element, blockId }: ElementProps<Datepicker>) {
  const { setValue, dispatch } = useBlockKit();
  const inInputBlock = useInInputBlock();
  const clearable = useInOptionalInput();
  const { ask, dialog } = useConfirm(element.confirm);
  const [date, setDate] = useState<string | undefined>(element.initial_date);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useFocusOnLoad<HTMLInputElement>(element);
  const invalid = useInvalidProps();
  // Focus given by `focus_on_load`, or handed back as the calendar closes, shouldn't pop the
  // calendar open; a user's focus does.
  const quietFocus = useRef(element.focus_on_load === true);
  // Opened with the pointer or a key, the calendar takes focus on its selected day, as Slack's
  // does. Opened by tabbing into the field, it leaves focus there so Tab keeps moving through the
  // form; ArrowDown then moves into the calendar.
  const focusCalendar = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const actionId = element.action_id ?? "";
  // What's typed into the field, while it differs from the chosen date; null shows the date.
  const [text, setText] = useState<string | null>(null);

  function focusDay() {
    focusCalendarDay(popupRef.current);
  }

  function close() {
    setOpen(false);
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    quietFocus.current = true;
    input.focus();
  }

  useEffect(() => {
    if (date) setValue(blockId, actionId, { type: "datepicker", selected_date: date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(next: string) {
    if (!(await ask())) return;
    close();
    commit(next);
  }

  /** Chooses `next` and sends it, as a pick in the calendar or a typed date does. */
  function commit(next: string) {
    setDate(next);
    setValue(blockId, actionId, { type: "datepicker", selected_date: next });
    dispatch({
      type: "datepicker",
      action_id: actionId,
      block_id: blockId,
      selected_date: next,
      // Slack echoes the element's initial_date back in the action, but not its placeholder.
      ...(element.initial_date !== undefined ? { initial_date: element.initial_date } : {}),
    });
  }

  /**
   * A typed date: Enter or leaving the field takes it, as Slack's field does, and anything that
   * isn't a date is ignored. The calendar stays open after Enter, as in Slack.
   */
  async function takeTyped(): Promise<void> {
    if (text === null) return;
    const next = parseTypedDate(text);
    if (!next) return;
    if (next !== date && !(await ask())) return;
    if (next !== date) commit(next);
  }

  async function clear() {
    if (!(await ask())) return;
    setDate(undefined);
    close();
    setValue(blockId, actionId, { type: "datepicker", selected_date: null });
    dispatch({
      type: "datepicker",
      action_id: actionId,
      block_id: blockId,
      selected_date: null,
      ...(element.initial_date !== undefined ? { initial_date: element.initial_date } : {}),
    });
  }

  return (
    <div className="sbk-datepicker" ref={rootRef}>
      <div className="sbk-datepicker__input_wrap">
        <CalendarIcon className="sbk-datepicker__icon" />
        <input
          className="sbk-datepicker__input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={text ?? (date ? formatDate(date, inInputBlock) : "")}
          placeholder={element.placeholder?.text ?? "Select a date"}
          aria-label="Date"
          {...invalid}
          ref={inputRef}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (quietFocus.current) quietFocus.current = false;
            else setOpen(true);
          }}
          onBlur={async () => {
            await takeTyped();
            setText(null);
          }}
          // A press focuses the field before its click, so mark the pointer on the way down.
          onMouseDown={() => {
            focusCalendar.current = true;
          }}
          onClick={() => {
            if (open) focusDay();
            else focusCalendar.current = true;
            setOpen(true);
          }}
          onKeyDown={(e) => {
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
          }}
        />
        {/* Slack's `c-date_picker__select_btn`: its own button, after the field in the tab order. */}
        <button
          type="button"
          className="sbk-datepicker__toggle"
          aria-label="Open calendar"
          onClick={() => {
            focusCalendar.current = true;
            if (open) focusDay();
            else setOpen(true);
          }}
        >
          <ChevronDownIcon className="sbk-datepicker__chevron" />
        </button>
      </div>
      {open && (
        <CalendarPopover
          anchorRef={rootRef}
          popupRef={popupRef}
          value={date}
          onSelect={pick}
          // Slack offers "Clear selection" only where the date may be left empty.
          onClear={clearable ? clear : undefined}
          onDismiss={() => setOpen(false)}
          onEscape={close}
          focusOnOpen={() => {
            const focus = focusCalendar.current;
            focusCalendar.current = false;
            return focus;
          }}
        />
      )}
      {dialog}
    </div>
  );
}
