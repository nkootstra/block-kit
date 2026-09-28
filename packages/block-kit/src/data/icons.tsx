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

/** Neutral (unsorted) column-sort indicator: a tight up/down chevron pair. */
export function SortNeutralIcon() {
  return (
    <svg viewBox="0 0 10 16" width="7" height="10" fill="none" aria-hidden="true">
      <path
        d="M1 6L5 2L9 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1 10L5 14L9 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
