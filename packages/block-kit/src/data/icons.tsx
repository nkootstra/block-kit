/** Small inline icons shared by the table/chart blocks, drawn to match Slack's glyphs. */

/** Slack's `search`, on a data table's Search button. */
export function SearchIcon() {
  return (
    <SlackGlyph d="M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3M1.5 9a7.5 7.5 0 1 1 13.307 4.746l3.473 3.474a.75.75 0 1 1-1.06 1.06l-3.473-3.473A7.5 7.5 0 0 1 1.5 9" />
  );
}

/** Two arrows pointing out to opposite corners: Slack's `expand-diagonal`, a data table cell's expand. */
export function ExpandDiagonalIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M13.25 2.25h4.5v4.5M17.5 2.5l-5.75 5.75M6.75 17.75h-4.5v-4.5M2.5 17.5l5.75-5.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four arrows pointing out to the corners: Slack's `arrow-expand-full`, a data table's expand. */
export function ExpandIcon() {
  return (
    <SlackGlyph d="M18.5 2.25a.75.75 0 0 0-.75-.75h-5a.75.75 0 0 0 0 1.5h3.19l-4.2 4.2a.75.75 0 0 0 1.06 1.06l4.2-4.2v3.19a.75.75 0 0 0 1.5 0zm-.22 16.03a.75.75 0 0 1-.53.22h-5a.75.75 0 0 1 0-1.5h3.19l-4.2-4.2a.75.75 0 1 1 1.06-1.06l4.2 4.2v-3.19a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-.22.53m-16.317.163a.75.75 0 0 1-.463-.693v-5a.75.75 0 0 1 1.5 0v3.19l4.2-4.2a.75.75 0 0 1 1.06 1.06L4.06 17h3.19a.75.75 0 0 1 0 1.5h-5a.8.8 0 0 1-.287-.057M1.5 2.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5H4.06l4.2 4.2A.75.75 0 0 1 7.2 8.26L3 4.06v3.19a.75.75 0 0 1-1.5 0z" />
  );
}

/** Slack's `ellipsis-vertical-filled`, on a data table's More actions button. */
export function KebabIcon() {
  return (
    <SlackGlyph d="M10 5.5A1.75 1.75 0 1 1 10 2a1.75 1.75 0 0 1 0 3.5m0 6.25a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5m-1.75 4.5a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0" />
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

const PAGE_CARETS = {
  left: "M12.03 5.72a.75.75 0 0 1 0 1.06L8.81 10l3.22 3.22a.75.75 0 1 1-1.06 1.06l-3.75-3.75a.75.75 0 0 1 0-1.06l3.75-3.75a.75.75 0 0 1 1.06 0",
  right:
    "M7.72 5.72a.75.75 0 0 1 1.06 0l3.75 3.75a.75.75 0 0 1 0 1.06l-3.75 3.75a.75.75 0 0 1-1.06-1.06L10.94 10 7.72 6.78a.75.75 0 0 1 0-1.06",
};

/** Slack's `caret-left` and `caret-right` at 18px, on a data table's previous and next page buttons. */
export function PageCaretIcon({ direction }: { direction: "left" | "right" }) {
  return <SlackGlyph d={PAGE_CARETS[direction]} size={18} />;
}

/** A glyph from Slack's 20x20 icon set (16px unless sized), filled with the text colour. */
function SlackGlyph({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
    >
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
