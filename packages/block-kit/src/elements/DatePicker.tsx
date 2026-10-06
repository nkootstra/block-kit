import type { Datepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { CalendarIcon, ChevronDownIcon } from "../icons";
import type { ElementProps } from "../types";
import { Calendar } from "./calendar/Calendar";
import { ordinal } from "./dateFormat";
import { useInInputBlock, useInvalidProps } from "./inputBlockContext";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { Popover } from "./Popover";

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
  const { ask, dialog } = useConfirm(element.confirm);
  const [date, setDate] = useState<string | undefined>(element.initial_date);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useFocusOnLoad<HTMLInputElement>(element);
  const invalid = useInvalidProps();
  // Focus given by `focus_on_load` shouldn't pop the calendar open; a user's focus does.
  const loadFocus = useRef(element.focus_on_load === true);
  const actionId = element.action_id ?? "";

  useEffect(() => {
    if (date) setValue(blockId, actionId, { type: "datepicker", selected_date: date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(next: string) {
    if (!(await ask())) return;
    setDate(next);
    setOpen(false);
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

  async function clear() {
    if (!(await ask())) return;
    setDate(undefined);
    setOpen(false);
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
          readOnly
          value={date ? formatDate(date, inInputBlock) : ""}
          placeholder={element.placeholder?.text ?? "Select a date"}
          aria-haspopup="dialog"
          aria-expanded={open}
          {...invalid}
          ref={inputRef}
          onFocus={() => {
            if (loadFocus.current) loadFocus.current = false;
            else setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <ChevronDownIcon className="sbk-datepicker__chevron" />
      </div>
      {open && (
        <Popover anchorRef={rootRef} onDismiss={() => setOpen(false)}>
          <div className="sbk-datepicker__popup">
            <Calendar value={date} onSelect={pick} onClear={clear} />
          </div>
        </Popover>
      )}
      {dialog}
    </div>
  );
}
