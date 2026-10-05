import type { Timepicker } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { ChevronDownIcon, ClockIcon } from "../icons";
import type { ElementProps } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";
import { useMenuNavigation } from "./useMenuNavigation";
import { Popover } from "./Popover";

/** Formats `HH:mm` the way Slack's closed timepicker shows it, e.g. "1:37 PM". */
function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Every 30 minutes, as Slack's timepicker list offers. */
function timeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30])
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return times;
}

export function TimePicker({ element, blockId }: ElementProps<Timepicker>) {
  const { setValue, dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const [time, setTime] = useState<string | undefined>(element.initial_time);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useFocusOnLoad(element, triggerRef);
  const invalid = useInvalidProps();
  const listRef = useRef<HTMLDivElement>(null);
  const actionId = element.action_id ?? "";

  useEffect(() => {
    if (time) setValue(blockId, actionId, { type: "timepicker", selected_time: time });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(next: string) {
    if (!(await ask())) return;
    setTime(next);
    setOpen(false);
    setValue(blockId, actionId, { type: "timepicker", selected_time: next });
    dispatch({ type: "timepicker", action_id: actionId, block_id: blockId, selected_time: next });
  }

  const times = timeOptions();
  const nav = useMenuNavigation({
    open,
    count: times.length,
    initialIndex: time ? times.indexOf(time) : -1,
    onChoose: (i) => {
      const t = times[i];
      if (t) pick(t);
    },
    onClose: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
    onOpen: () => setOpen(true),
    listRef,
  });

  return (
    <div className="sbk-timepicker" ref={rootRef} onKeyDown={nav.onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="sbk-timepicker__control"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        {...invalid}
      >
        <ClockIcon className="sbk-timepicker__icon" />
        <span className={time ? "sbk-timepicker__value" : "sbk-timepicker__placeholder"}>
          {time ? formatTime(time) : (element.placeholder?.text ?? "Select time")}
        </span>
        <ChevronDownIcon className="sbk-timepicker__chevron" />
      </button>
      {open && (
        <Popover anchorRef={rootRef} onDismiss={() => setOpen(false)}>
          <div className="sbk-timepicker__menu" role="listbox" ref={listRef}>
            {times.map((t, i) => (
              <div
                key={t}
                role="option"
                aria-selected={t === time}
                className={`sbk-timepicker__option${t === time ? " sbk-timepicker__option--selected" : ""}`}
                onClick={() => pick(t)}
                {...nav.itemProps(i)}
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
