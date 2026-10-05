import type { DateTimepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { CalendarIcon, ChevronDownIcon, ClockIcon } from "../icons";
import type { ElementProps } from "../types";
import { Calendar } from "./calendar/Calendar";
import { fromWallClock, ordinal, timeZoneLabel, wallClock } from "./dateFormat";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { Popover } from "./Popover";

/** Slack's Builder splits a datetimepicker's closed control into a date box ("January 1st,
 * 2026") and a separate time box ("11:00 AM"), rather than one combined string. */
function formatDate(ts: number, timeZone: string): string {
  const d = new Date(ts * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  return `${month} ${ordinal(day)}, ${year}`;
}

function formatTime(ts: number, timeZone: string): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function DateTimePicker({ element, blockId }: ElementProps<DateTimepicker>) {
  const { setValue, dispatch, timeZone } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const [value, setValueState] = useState<number | undefined>(element.initial_date_time);
  const [open, setOpen] = useState(false);
  const zone = timeZone ?? "UTC";
  const initial =
    element.initial_date_time !== undefined
      ? wallClock(element.initial_date_time, zone)
      : undefined;
  const [draftDate, setDraftDate] = useState<string | undefined>(initial?.date);
  const [draftTime, setDraftTime] = useState<string>(initial?.time ?? "12:00");
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useFocusOnLoad<HTMLButtonElement>(element);
  const actionId = element.action_id ?? "";

  useEffect(() => {
    if (value !== undefined) {
      setValue(blockId, actionId, {
        type: "datetimepicker",
        selected_date_time: value,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function apply() {
    if (!draftDate) return;
    if (!(await ask())) return;
    const ts = fromWallClock(draftDate, draftTime, zone);
    setValueState(ts);
    setOpen(false);
    setValue(blockId, actionId, {
      type: "datetimepicker",
      selected_date_time: ts,
    });
    dispatch({
      type: "datetimepicker",
      action_id: actionId,
      block_id: blockId,
      selected_date_time: ts,
    });
  }

  return (
    <div className="sbk-datetimepicker" ref={rootRef}>
      <div className="sbk-datetimepicker__row">
        <div className="sbk-datetimepicker__column">
          <button
            ref={focusRef}
            type="button"
            className="sbk-datetimepicker__control sbk-datetimepicker__control--date"
            onClick={() => setOpen((o) => !o)}
          >
            <CalendarIcon className="sbk-datetimepicker__icon" />
            <span
              className={
                value !== undefined
                  ? "sbk-datetimepicker__value"
                  : "sbk-datetimepicker__placeholder"
              }
            >
              {value !== undefined ? formatDate(value, zone) : "Select a date"}
            </span>
            <ChevronDownIcon className="sbk-datetimepicker__chevron" />
          </button>
        </div>
        <div className="sbk-datetimepicker__column">
          <button
            type="button"
            className="sbk-datetimepicker__control sbk-datetimepicker__control--time"
            onClick={() => setOpen((o) => !o)}
          >
            <ClockIcon className="sbk-datetimepicker__icon" />
            <span
              className={
                value !== undefined
                  ? "sbk-datetimepicker__value"
                  : "sbk-datetimepicker__placeholder"
              }
            >
              {value !== undefined ? formatTime(value, zone) : "Select a time"}
            </span>
            <ChevronDownIcon className="sbk-datetimepicker__chevron" />
          </button>
          <p className="sbk-datetimepicker__timezone">Time zone: {timeZoneLabel(zone)}</p>
        </div>
      </div>
      {open && (
        <Popover anchorRef={rootRef} onDismiss={() => setOpen(false)}>
          <div className="sbk-datetimepicker__popup">
            <Calendar value={draftDate} onSelect={setDraftDate} />
            <div className="sbk-datetimepicker__time-row">
              <input
                type="time"
                className="sbk-datetimepicker__time-input"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
              />
              <button
                type="button"
                className="sbk-datetimepicker__apply"
                onClick={apply}
                disabled={!draftDate}
              >
                Apply
              </button>
            </div>
          </div>
        </Popover>
      )}
      {dialog}
    </div>
  );
}
