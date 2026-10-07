import type { Timepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { ChevronDownIcon, ClockIcon } from "../icons";
import type { ElementProps } from "../types";
import { useClientLayoutEffect } from "../useClientLayoutEffect";
import { timeZoneLabel } from "./dateFormat";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";
import { useCombobox } from "./useCombobox";
import { MENU_GAP, Popover } from "./Popover";

/** Formats `HH:mm` the way Slack's timepicker shows it, e.g. "1:37 PM". */
export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Every hour of the day, as Slack's timepicker list offers. */
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

/**
 * Reads a typed time as `HH:mm`: "2:15 PM", "2:15pm", "2pm", "14:15" or "9". Without AM or PM the
 * hour is read on a 24-hour clock. Slack accepts typed times too; whether it keeps one off the hour
 * (2:15 PM) or rounds it hasn't been verified, so the minutes are kept as typed.
 */
export function parseTime(input: string): string | undefined {
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])\.?m?\.?$|^(\d{1,2})(?::(\d{2}))?$/i.exec(
    input.trim(),
  );
  if (!match) return undefined;
  const meridiem = match[3]?.toLowerCase();
  let hour = Number(match[1] ?? match[4]);
  const minute = Number(match[2] ?? match[5] ?? 0);
  if (minute > 59) return undefined;
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return undefined;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The rows of Slack's time list: every hour, whatever is typed. Slack's list doesn't filter as you
 * type; Enter reads the typed time instead.
 */
export const TIMES: readonly string[] = HOURS;

export function TimePicker({ element, blockId }: ElementProps<Timepicker>) {
  const { setValue, dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const [time, setTime] = useState<string | undefined>(element.initial_time);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const invalid = useInvalidProps();
  const actionId = element.action_id ?? "";

  useEffect(() => {
    if (time) setValue(blockId, actionId, { type: "timepicker", selected_time: time });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(next: string) {
    combo.setOpen(false);
    if (!(await ask())) return;
    setTime(next);
    setValue(blockId, actionId, { type: "timepicker", selected_time: next });
    dispatch({
      type: "timepicker",
      action_id: actionId,
      block_id: blockId,
      selected_time: next,
      // Slack echoes the element's initial_time back in the action, but not its placeholder.
      ...(element.initial_time !== undefined ? { initial_time: element.initial_time } : {}),
    });
  }

  const [query, setQuery] = useState("");
  const times = TIMES;
  const combo = useCombobox({
    query,
    onQueryChange: setQuery,
    count: times.length,
    // Slack opens its time list with nothing highlighted, even with a time chosen.
    initialIndex: -1,
    onChoose: (i) => {
      const t = times[i];
      if (t) pick(t);
    },
    onSubmitQuery: (typed) => {
      const t = parseTime(typed);
      if (t) pick(t);
    },
    listRef,
    highlightOnType: false,
  });
  useFocusOnLoad(element, combo.inputRef);

  // Reopened, Slack's field holds the chosen time as text, selected, so typing replaces it. The
  // text is selected once it's in the field, a render after the query is set.
  const selectOnOpen = useRef(false);
  useEffect(() => {
    if (!combo.open || !time) return;
    selectOnOpen.current = true;
    setQuery(formatTime(time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo.open]);
  useClientLayoutEffect(() => {
    if (!selectOnOpen.current) return;
    selectOnOpen.current = false;
    combo.inputRef.current?.select();
  }, [query]);

  const display = time ? formatTime(time) : undefined;
  const input = combo.inputProps(display, element.placeholder?.text ?? "Select time");
  // Slack keeps the chosen time in the input but draws it in a layer over the field
  // (`c-select_input__content`), hiding the input's own text, until the list opens for typing.
  const overlay = display !== undefined && !combo.open;

  return (
    <div className="sbk-timepicker" ref={rootRef}>
      {/* A label, so a press on the icons or padding lands in the input as on Slack's field. */}
      <label className="sbk-timepicker__control">
        <ClockIcon className="sbk-timepicker__icon" />
        <input
          {...input}
          {...invalid}
          className={`sbk-timepicker__input${overlay ? " sbk-timepicker__input--behind" : ""}`}
        />
        <ChevronDownIcon className="sbk-timepicker__chevron" />
        {overlay && (
          <span className="sbk-timepicker__content" aria-hidden="true">
            <span className="sbk-timepicker__content-text">{display}</span>
          </span>
        )}
      </label>
      {combo.open && (
        <Popover
          anchorRef={rootRef}
          onDismiss={() => combo.setOpen(false)}
          offsetX={-12}
          gap={MENU_GAP}
        >
          <div className="sbk-timepicker__menu" role="listbox" id={combo.listId} ref={listRef}>
            {times.map((t, i) => (
              <div
                key={t}
                role="option"
                aria-selected={t === time}
                className={`sbk-timepicker__option${t === time ? " sbk-timepicker__option--selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t)}
                {...combo.optionProps(i)}
              >
                {formatTime(t)}
              </div>
            ))}
          </div>
        </Popover>
      )}
      {element.timezone && (
        <div className="sbk-timepicker__hint">Time zone: {timeZoneLabel(element.timezone)}</div>
      )}
      {dialog}
    </div>
  );
}
