import type { RefObject } from "react";
import { MENU_GAP, Popover } from "../Popover";
import { Calendar } from "./Calendar";

export interface CalendarPopoverProps {
  /** The field the calendar opens from; the calendar's right edge lines up with its right edge. */
  anchorRef: RefObject<HTMLElement | null>;
  /** The popup itself, so the field can move focus into the calendar while it's open. */
  popupRef: RefObject<HTMLDivElement | null>;
  value?: string;
  onSelect: (date: string) => void;
  /** Offered as Slack's "Clear selection" footer while a date is chosen. */
  onClear?: () => void;
  /** A press outside the field and the calendar. */
  onDismiss: () => void;
  /** Escape, from anywhere in the calendar. */
  onEscape: () => void;
  /** Called once the calendar is placed; true moves focus onto its focused day. */
  focusOnOpen: () => boolean;
  /** Horizontal shift of the calendar's right edge from the field's. */
  offsetX?: number;
}

/** Moves focus onto the calendar's focused day: the selected one, else today, else the 1st. */
export function focusCalendarDay(popup: HTMLElement | null) {
  popup?.querySelector<HTMLElement>(".sbk-calendar__grid [tabindex='0']")?.focus();
}

/**
 * Slack's datepicker dropdown (`c-date_picker__dropdown`): the month calendar in a popover that
 * overlaps the bottom of its field by 4px, its right edge on the field's. The datepicker and the
 * date half of the datetimepicker both open it.
 */
export function CalendarPopover({
  anchorRef,
  popupRef,
  value,
  onSelect,
  onClear,
  onDismiss,
  onEscape,
  focusOnOpen,
  offsetX,
}: CalendarPopoverProps) {
  return (
    <Popover
      anchorRef={anchorRef}
      gap={MENU_GAP}
      offsetX={offsetX}
      onDismiss={onDismiss}
      onPlaced={() => {
        if (focusOnOpen()) focusCalendarDay(popupRef.current);
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes the dialog, wherever focus is in it */}
      <div
        className="sbk-datepicker__popup"
        // React 18's types want a ref to a non-null element; the object is the same either way.
        ref={popupRef as RefObject<HTMLDivElement>}
        role="dialog"
        aria-label="Choose a date"
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          onEscape();
        }}
      >
        <Calendar value={value} onSelect={onSelect} onClear={onClear} />
      </div>
    </Popover>
  );
}
