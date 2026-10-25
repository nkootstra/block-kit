import type { Datepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import type { ElementProps } from "../types";
import { CalendarPopover } from "./calendar/CalendarPopover";
import { DateField, useDateField } from "./DateField";
import { ordinal } from "./dateFormat";
import { useInClearableInput, useInInputBlock, useInvalidProps } from "./inputBlockContext";
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
  const { setValue, dispatch, surface } = useBlockKit();
  // Slack draws the small field in messages and the medium one in modals and on App Home.
  const medium = surface !== "message";
  const inInputBlock = useInInputBlock();
  const clearable = useInClearableInput();
  const { ask, dialog } = useConfirm(element.confirm);
  const [date, setDate] = useState<string | undefined>(element.initial_date);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useFocusOnLoad<HTMLInputElement>(element);
  const invalid = useInvalidProps();
  const actionId = element.action_id ?? "";
  const field = useDateField({
    inputRef,
    focusOnLoad: element.focus_on_load,
    display: date ? formatDate(date, inInputBlock) : "",
    onType: async (next) => {
      if (next !== date && (await ask())) commit(next);
    },
  });

  useEffect(() => {
    if (date) setValue(blockId, actionId, { type: "datepicker", selected_date: date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A day picked with the keyboard hands focus back to the field. One picked with a press leaves
   * nothing focused, as Slack's calendar does, so the field doesn't keep its focus ring
   * (`catalog/actions/datepickers@pick+mobile`).
   */
  async function pick(next: string, pointer: boolean) {
    if (!(await ask())) return;
    if (pointer) field.setOpen(false);
    else field.close();
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

  async function clear() {
    if (!(await ask())) return;
    setDate(undefined);
    field.close();
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
    <div className={`sbk-datepicker${medium ? " sbk-datepicker--medium" : ""}`} ref={rootRef}>
      <DateField
        field={field}
        placeholder={element.placeholder?.text ?? "Select a date"}
        invalid={invalid}
      />
      {field.open && (
        <CalendarPopover
          anchorRef={rootRef}
          // Slack's medium field opens its dropdown 4px inside its right edge; the small one lines up.
          offsetX={medium ? -4 : undefined}
          value={date}
          onSelect={pick}
          // Slack offers "Clear selection" only where the date may be left empty.
          onClear={clearable ? clear : undefined}
          {...field.popoverProps}
        />
      )}
      {dialog}
    </div>
  );
}
