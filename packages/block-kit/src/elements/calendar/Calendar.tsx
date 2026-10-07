import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ordinal } from "../dateFormat";

export interface CalendarProps {
  /** `YYYY-MM-DD`, or undefined for no selection. */
  value?: string;
  onSelect: (date: string) => void;
  /** When given (and a date is selected), a "Clear selection" footer is shown, as in Slack. */
  onClear?: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISO(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function todayISO() {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Slack's calendar header icons, 20×20. */
const NAV_PATHS = {
  "previous-year":
    "M11.03 2.78a.75.75 0 1 0-1.06-1.06L2.22 9.47a.75.75 0 0 0 0 1.06l7.75 7.75a.75.75 0 1 0 1.06-1.06L3.81 10zm6.25 0a.75.75 0 0 0-1.06-1.06L8.47 9.47a.75.75 0 0 0 0 1.06l7.75 7.75a.75.75 0 1 0 1.06-1.06L10.06 10z",
  "previous-month":
    "M14.53 1.72a.75.75 0 0 1 0 1.06L7.31 10l7.22 7.22a.75.75 0 1 1-1.06 1.06l-7.75-7.75a.75.75 0 0 1 0-1.06l7.75-7.75a.75.75 0 0 1 1.06 0",
  "next-month":
    "M5.72 1.72a.75.75 0 0 1 1.06 0l7.75 7.75a.75.75 0 0 1 0 1.06l-7.75 7.75a.75.75 0 0 1-1.06-1.06L12.94 10 5.72 2.78a.75.75 0 0 1 0-1.06",
  "next-year":
    "M3.78 1.72a.75.75 0 0 0-1.06 1.06L9.94 10l-7.22 7.22a.75.75 0 1 0 1.06 1.06l7.75-7.75a.75.75 0 0 0 0-1.06zm6.25 0a.75.75 0 1 0-1.06 1.06L16.19 10l-7.22 7.22a.75.75 0 1 0 1.06 1.06l7.75-7.75a.75.75 0 0 0 0-1.06z",
} as const;

/** A header button that moves the calendar by `months`. */
function NavButton({
  icon,
  label,
  onClick,
}: {
  icon: keyof typeof NAV_PATHS;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sbk-calendar__nav" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d={NAV_PATHS[icon]} />
      </svg>
    </button>
  );
}

/** A day's name in full, as Slack labels its day buttons: "Saturday, April 28th, 1990". */
function dayLabel(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekday}, ${month} ${ordinal(d)}, ${y}`;
}

/** The day `delta` days after the `YYYY-MM-DD` date, as `YYYY-MM-DD`. */
function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Days the arrow keys move the focused day: a day sideways, a week up or down. */
const ARROW_DAYS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/** A month grid matching Slack's `c-date_picker_calendar`: a bordered 7-column grid of 44×42
 * day cells, a ring around today, and solid blue for the selected day. The grid is one tab stop:
 * the focused day (the selected one, else today, else the 1st) takes Tab, and the arrow keys move
 * it a day or a week, turning the month when they cross its edge. */
export function Calendar({ value, onSelect, onClear }: CalendarProps) {
  const initial = value ? new Date(`${value}T00:00:00Z`) : new Date();
  const [year, setYear] = useState(initial.getUTCFullYear());
  const [month, setMonth] = useState(initial.getUTCMonth());
  const [focused, setFocused] = useState(() => {
    if (value) return value;
    const today = todayISO();
    return today.startsWith(toISO(year, month, 1).slice(0, 7)) ? today : toISO(year, month, 1);
  });
  const gridRef = useRef<HTMLDivElement>(null);
  // Set once the arrow keys move the focused day, which then shows like a hovered one, as Slack's
  // keyboard-active day does; Firefox doesn't count that script-moved focus as `:focus-visible`.
  const [keyboard, setKeyboard] = useState(false);
  // Only the keyboard moves DOM focus; a month turned with the arrow buttons leaves it alone.
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, year, month]);

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = ARROW_DAYS[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    setKeyboard(true);
    const next = addDays(focused, delta);
    const [y = year, m = month + 1] = next.split("-").map(Number);
    moveFocus.current = true;
    setFocused(next);
    if (y !== year || m - 1 !== month) {
      setYear(y);
      setMonth(m - 1);
    }
  }

  // The focused day stays in the shown month: turning the month with the buttons moves it there.
  const shown = toISO(year, month, 1).slice(0, 7);
  const tabStop = focused.startsWith(shown) ? focused : toISO(year, month, 1);

  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const today = todayISO();
  const lastRow = Math.floor((startWeekday + daysInMonth - 1) / 7);
  const lastRowFull = (startWeekday + daysInMonth) % 7 === 0;

  /** The grid's outer corners a day sits on, which Slack rounds. */
  function corners(day: number): string[] {
    const at = startWeekday + day - 1;
    const row = Math.floor(at / 7);
    const col = at % 7;
    const out: string[] = [];
    if (day === 1 || (row === 1 && col === 0)) out.push("top-left");
    if (row === 0 && col === 6) out.push("top-right");
    if (row === lastRow && col === 0) out.push("bottom-left");
    if (day === daysInMonth || (!lastRowFull && row === lastRow - 1 && col === 6))
      out.push("bottom-right");
    return out;
  }

  function go(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <div className="sbk-calendar">
        <div className="sbk-calendar__header">
          <NavButton icon="previous-year" label="Previous year" onClick={() => go(-12)} />
          <NavButton icon="previous-month" label="Previous month" onClick={() => go(-1)} />
          <span className="sbk-calendar__label">{monthLabel}</span>
          <NavButton icon="next-month" label="Next month" onClick={() => go(1)} />
          <NavButton icon="next-year" label="Next year" onClick={() => go(12)} />
        </div>
        <div className="sbk-calendar__weekdays">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div
          className={`sbk-calendar__grid${keyboard ? " sbk-calendar__grid--keyboard" : ""}`}
          ref={gridRef}
          onKeyDown={onGridKeyDown}
          onPointerDown={() => setKeyboard(false)}
        >
          {cells.map((day, i) => {
            if (day === null)
              return <span key={i} className="sbk-calendar__cell sbk-calendar__cell--empty" />;
            const iso = toISO(year, month, day);
            const classes = [
              "sbk-calendar__cell",
              ...corners(day).map((c) => `sbk-calendar__cell--${c}`),
            ];
            if (iso === value) classes.push("sbk-calendar__cell--selected");
            if (iso === today) classes.push("sbk-calendar__cell--today");
            return (
              <button
                type="button"
                key={iso}
                className={classes.join(" ")}
                aria-pressed={iso === value}
                aria-current={iso === today ? "date" : undefined}
                data-date={iso}
                aria-label={dayLabel(iso)}
                tabIndex={iso === tabStop ? 0 : -1}
                onFocus={() => setFocused(iso)}
                onClick={() => onSelect(iso)}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
      {/* Slack's `c-date_picker__clear_selection_container` sits below the calendar box, across the
          whole popup. */}
      {onClear && value && (
        <div className="sbk-calendar__footer">
          <button type="button" className="sbk-calendar__clear" onClick={onClear}>
            Clear selection
          </button>
        </div>
      )}
    </>
  );
}
