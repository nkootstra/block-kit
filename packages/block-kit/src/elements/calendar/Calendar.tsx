import { type KeyboardEvent, useEffect, useRef, useState } from "react";

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

function Caret({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={
          direction === "left"
            ? "M12.28 5.22a.75.75 0 0 1 0 1.06L8.56 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0"
            : "M7.72 14.78a.75.75 0 0 1 0-1.06L11.44 10 7.72 6.28a.75.75 0 0 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0"
        }
        clipRule="evenodd"
      />
    </svg>
  );
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
    <div className="sbk-calendar">
      <div className="sbk-calendar__header">
        <button
          type="button"
          className="sbk-calendar__nav"
          onClick={() => go(-1)}
          aria-label="Previous month"
        >
          <Caret direction="left" />
        </button>
        <span className="sbk-calendar__label">{monthLabel}</span>
        <button
          type="button"
          className="sbk-calendar__nav"
          onClick={() => go(1)}
          aria-label="Next month"
        >
          <Caret direction="right" />
        </button>
      </div>
      <div className="sbk-calendar__weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="sbk-calendar__grid" ref={gridRef} onKeyDown={onGridKeyDown}>
        {cells.map((day, i) => {
          if (day === null)
            return <span key={i} className="sbk-calendar__cell sbk-calendar__cell--empty" />;
          const iso = toISO(year, month, day);
          const classes = ["sbk-calendar__cell"];
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
              tabIndex={iso === tabStop ? 0 : -1}
              onFocus={() => setFocused(iso)}
              onClick={() => onSelect(iso)}
            >
              {day}
            </button>
          );
        })}
      </div>
      {onClear && value && (
        <div className="sbk-calendar__footer">
          <button type="button" className="sbk-calendar__clear" onClick={onClear}>
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}
