/** Small inline icons shared by the table/chart blocks, drawn to match Slack's glyphs. */

export function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.8" />
      <line
        x1="13"
        y1="13"
        x2="17.5"
        y2="17.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M7 3H3v4M13 3h4v4M3 13v4h4M17 13v4h-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KebabIcon() {
  return (
    <svg viewBox="0 0 4 18" width="4" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="2" />
      <circle cx="2" cy="9" r="2" />
      <circle cx="2" cy="16" r="2" />
    </svg>
  );
}

/** Slack's `caret-right` glyph, turned to point down when expanded (task card and plan toggles). */
const CARET_ROTATION = { right: undefined, down: "rotate(90deg)", left: "rotate(180deg)" };

export function CaretIcon({
  direction = "right",
  size = 13,
}: {
  direction?: "right" | "down" | "left";
  size?: number;
}) {
  const rotation = CARET_ROTATION[direction];
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      style={rotation ? { transform: rotation } : undefined}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.72 5.72a.75.75 0 0 1 1.06 0l3.75 3.75a.75.75 0 0 1 0 1.06l-3.75 3.75a.75.75 0 0 1-1.06-1.06L10.94 10 7.72 6.78a.75.75 0 0 1 0-1.06"
      />
    </svg>
  );
}

export function ChevronIcon({
  direction = "down",
}: {
  direction?: "up" | "down" | "left" | "right";
}) {
  const rotation = { up: 180, down: 0, left: 90, right: -90 }[direction];
  return (
    <svg
      viewBox="0 0 12 8"
      width="7"
      height="4"
      fill="none"
      aria-hidden="true"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M1 1.5L6 6.5L11 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A 16px glyph from Slack's 20x20 icon set, filled with the text colour. */
function SlackGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Slack's `chevron-down`, shown on a sortable column header while it's hovered or focused. */
export function SortCaretIcon() {
  return (
    <SlackGlyph d="M5.72 7.47a.75.75 0 0 1 1.06 0L10 10.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-3.75 3.75a.75.75 0 0 1-1.06 0L5.72 8.53a.75.75 0 0 1 0-1.06" />
  );
}

/** Slack's `arrow-up`, on the sort menu's Ascending item. */
export function ArrowUpIcon() {
  return (
    <SlackGlyph d="M10.543 3.232a.75.75 0 0 0-1.086 0l-5.25 5.5a.75.75 0 0 0 1.086 1.036L9.25 5.622V16.25a.75.75 0 0 0 1.5 0V5.622l3.957 4.146a.75.75 0 0 0 1.085-1.036z" />
  );
}

/** Slack's `arrow-down`, on the sort menu's Descending item. */
export function ArrowDownIcon() {
  return (
    <SlackGlyph d="M10.75 3.75a.75.75 0 0 0-1.5 0v10.628l-3.957-4.146a.75.75 0 0 0-1.086 1.036l5.25 5.5a.75.75 0 0 0 1.085 0l5.25-5.5a.75.75 0 0 0-1.085-1.036l-3.957 4.146z" />
  );
}

/** Slack's `check`, beside the checked item of a menu. */
export function MenuCheckIcon() {
  return (
    <SlackGlyph d="M17.234 3.677a.75.75 0 0 1 .089 1.057l-9.72 11.5a.75.75 0 0 1-1.19-.058L2.633 10.7a.75.75 0 0 1 1.234-.852l3.223 4.669 9.087-10.751a.75.75 0 0 1 1.057-.089" />
  );
}
