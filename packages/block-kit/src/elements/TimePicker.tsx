import type { Timepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { ChevronDownIcon, ClockIcon } from "../icons";
import type { ElementProps } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";
import { useCombobox } from "./useCombobox";
import { Popover } from "./Popover";

/** Formats `HH:mm` the way Slack's timepicker shows it, e.g. "1:37 PM". */
function formatTime(time: string): string {
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

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, "");

/** The rows for a query: the hours whose label starts with it, after a typed time the list lacks. */
function timesFor(query: string): string[] {
  if (!query.trim()) return HOURS;
  const typed = parseTime(query);
  const hours = HOURS.filter((t) => squash(formatTime(t)).startsWith(squash(query)));
  return typed && !hours.includes(typed) && !HOURS.includes(typed) ? [typed, ...hours] : hours;
}

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
  const times = timesFor(query);
  const combo = useCombobox({
    query,
    onQueryChange: setQuery,
    count: times.length,
    initialIndex: time ? times.indexOf(time) : -1,
    onChoose: (i) => {
      const t = times[i];
      if (t) pick(t);
    },
    onSubmitQuery: (typed) => {
      const t = parseTime(typed);
      if (t) pick(t);
    },
    listRef,
  });
  useFocusOnLoad(element, combo.inputRef);

  const input = combo.inputProps(
    time ? formatTime(time) : undefined,
    element.placeholder?.text ?? "Select time",
  );

  return (
    <div className="sbk-timepicker" ref={rootRef}>
      {/* A label, so a press on the icons or padding lands in the input as on Slack's field. */}
      <label className="sbk-timepicker__control">
        <ClockIcon className="sbk-timepicker__icon" />
        <input {...input} {...invalid} className="sbk-timepicker__input" />
        <ChevronDownIcon className="sbk-timepicker__chevron" />
      </label>
      {combo.open && (
        <Popover anchorRef={rootRef} onDismiss={() => combo.setOpen(false)} offsetX={-12}>
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
      {element.timezone && <div className="sbk-timepicker__hint">Timezone: {element.timezone}</div>}
      {dialog}
    </div>
  );
}
