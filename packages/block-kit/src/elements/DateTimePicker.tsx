import type { DateTimepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { CalendarIcon, ChevronDownIcon, ClockIcon } from "../icons";
import type { ElementProps } from "../types";
import { CalendarPopover, focusCalendarDay } from "./calendar/CalendarPopover";
import { fromWallClock, ordinal, timeZoneLabel, wallClock } from "./dateFormat";
import { MENU_GAP, Popover } from "./Popover";
import { formatTime, parseTime, timesFor } from "./TimePicker";
import { useCombobox } from "./useCombobox";
import { useFocusOnLoad } from "./useFocusOnLoad";

/** A day and a time of day, as the user sees them in the configured zone. */
interface WallClock {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm` */
  time: string;
}

/** The time list's first row while a value is chosen. */
const CLEAR = "clear";

/** Slack spells a datetimepicker's day out ("January 1st, 2026"), and calls today "Today". */
function formatDay(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(`${date}T00:00:00Z`);
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${ordinal(d.getUTCDate())}, ${d.getUTCFullYear()}`;
}

/**
 * Slack's datetimepicker: a date field and a time field side by side, each changing the value on
 * its own. The date field opens the datepicker's calendar and the time field the timepicker's
 * hourly list (230px wide here). Picking either part fills in the other if it's empty (the time
 * now, or today) and sends the action straight away; "Clear selection" in either empties both.
 */
export function DateTimePicker({ element, blockId }: ElementProps<DateTimepicker>) {
  const { setValue, dispatch, timeZone } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const zone = timeZone ?? "UTC";
  const [value, setValueState] = useState<WallClock | undefined>(() =>
    element.initial_date_time !== undefined
      ? wallClock(element.initial_date_time, zone)
      : undefined,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dateRef = useFocusOnLoad<HTMLButtonElement>(element);
  const popupRef = useRef<HTMLDivElement>(null);
  const timeFieldRef = useRef<HTMLLabelElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Opened with the pointer or a key, the calendar takes focus on its selected day, as the
  // datepicker's does.
  const focusCalendar = useRef(false);
  const actionId = element.action_id ?? "";
  const now = () => wallClock(Math.floor(Date.now() / 1000), zone);

  useEffect(() => {
    if (element.initial_date_time !== undefined) {
      setValue(blockId, actionId, {
        type: "datetimepicker",
        selected_date_time: element.initial_date_time,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function change(next: WallClock | undefined) {
    if (!(await ask())) return;
    setValueState(next);
    const selected = next ? fromWallClock(next.date, next.time, zone) : null;
    setValue(blockId, actionId, { type: "datetimepicker", selected_date_time: selected });
    dispatch({
      type: "datetimepicker",
      action_id: actionId,
      block_id: blockId,
      selected_date_time: selected,
      // Slack echoes the element's initial_date_time back in the action.
      ...(element.initial_date_time !== undefined
        ? { initial_date_time: element.initial_date_time }
        : {}),
    });
  }

  function closeCalendar() {
    setCalendarOpen(false);
    if (document.activeElement !== dateRef.current) dateRef.current?.focus();
  }

  function pickDate(date: string) {
    closeCalendar();
    // Slack fills an empty time with the current one, to the minute.
    change({ date, time: value?.time ?? now().time });
  }

  function pickTime(time: string) {
    combo.setOpen(false);
    change({ date: value?.date ?? now().date, time });
  }

  function clear() {
    setCalendarOpen(false);
    combo.setOpen(false);
    change(undefined);
  }

  const [query, setQuery] = useState("");
  const rows = [...(value && !query.trim() ? [CLEAR] : []), ...timesFor(query)];
  const combo = useCombobox({
    query,
    onQueryChange: setQuery,
    count: rows.length,
    initialIndex: value ? rows.indexOf(value.time) : -1,
    onChoose: (i) => {
      const row = rows[i];
      if (row === CLEAR) clear();
      else if (row) pickTime(row);
    },
    onSubmitQuery: (typed) => {
      const time = parseTime(typed);
      if (time) pickTime(time);
    },
    listRef,
  });

  const timeDisplay = value ? formatTime(value.time) : undefined;
  const input = combo.inputProps(timeDisplay, "Time");
  // As in the timepicker, the chosen time is drawn in a layer over the field (Slack's
  // `c-select_input__content`) until the list opens for typing.
  const overlay = timeDisplay !== undefined && !combo.open;

  return (
    <div className="sbk-datetimepicker">
      <div className="sbk-datetimepicker__row">
        <div className="sbk-datetimepicker__column">
          <button
            ref={dateRef}
            type="button"
            className="sbk-datetimepicker__control sbk-datetimepicker__control--date"
            onClick={() => {
              if (calendarOpen) {
                focusCalendarDay(popupRef.current);
                return;
              }
              focusCalendar.current = true;
              setCalendarOpen(true);
            }}
          >
            <CalendarIcon className="sbk-datetimepicker__icon" />
            <span
              className={value ? "sbk-datetimepicker__value" : "sbk-datetimepicker__placeholder"}
            >
              {value ? formatDay(value.date, now().date) : "Select a date"}
            </span>
            <ChevronDownIcon className="sbk-datetimepicker__chevron" />
          </button>
        </div>
        <div className="sbk-datetimepicker__column">
          {/* A label, so a press on the icons or padding lands in the input as on Slack's field. */}
          <label
            ref={timeFieldRef}
            className="sbk-datetimepicker__control sbk-datetimepicker__control--time"
          >
            <ClockIcon className="sbk-datetimepicker__icon" />
            <input
              {...input}
              className={`sbk-datetimepicker__input${overlay ? " sbk-datetimepicker__input--behind" : ""}`}
            />
            <ChevronDownIcon className="sbk-datetimepicker__chevron" />
            {overlay && (
              <span className="sbk-datetimepicker__content" aria-hidden="true">
                <span className="sbk-datetimepicker__content-text">{timeDisplay}</span>
              </span>
            )}
          </label>
          <p className="sbk-datetimepicker__timezone">Time zone: {timeZoneLabel(zone)}</p>
        </div>
      </div>
      {calendarOpen && (
        <CalendarPopover
          anchorRef={dateRef}
          popupRef={popupRef}
          value={value?.date}
          onSelect={pickDate}
          onClear={value ? clear : undefined}
          onDismiss={() => setCalendarOpen(false)}
          onEscape={closeCalendar}
          focusOnOpen={() => {
            const focus = focusCalendar.current;
            focusCalendar.current = false;
            return focus;
          }}
          // Measured in Block Kit Builder: here the calendar's right edge sits 4px inside the
          // date field's.
          offsetX={-4}
        />
      )}
      {combo.open && (
        <Popover
          anchorRef={timeFieldRef}
          onDismiss={() => combo.setOpen(false)}
          offsetX={-12}
          gap={MENU_GAP}
        >
          <div
            className="sbk-timepicker__menu sbk-timepicker__menu--wide"
            role="listbox"
            id={combo.listId}
            ref={listRef}
          >
            {rows.map((row, i) => (
              <div
                key={row}
                role="option"
                aria-selected={row === value?.time}
                className={`sbk-timepicker__option${row === CLEAR ? " sbk-timepicker__option--clear" : ""}${row === value?.time ? " sbk-timepicker__option--selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (row === CLEAR ? clear() : pickTime(row))}
                {...combo.optionProps(i)}
              >
                {row === CLEAR ? "Clear selection" : formatTime(row)}
              </div>
            ))}
          </div>
        </Popover>
      )}
      {dialog}
    </div>
  );
}
