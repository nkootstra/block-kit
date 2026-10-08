import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "../context";
import { useClientLayoutEffect } from "../useClientLayoutEffect";

/** Space between the pointer and the tooltip, on both axes (ECharts' default). */
const GAP = 20;

export interface ChartTooltipRow {
  name: string;
  value: number;
  /** The series colour, for the row's dot. */
  color: string;
}

export interface ChartTooltipProps {
  /** The pointer, in client coordinates. */
  pointer: { x: number; y: number };
  /** The chart's box in client coordinates: the tooltip changes sides rather than leave it. */
  box: { left: number; top: number; width: number; height: number };
  /** The category, above the rows; a pie's tooltip has none. */
  title?: string;
  rows: ChartTooltipRow[];
}

/**
 * The tooltip Slack's charts show under the pointer (an ECharts tooltip): the category, then each
 * series' dot, name and value. It sits 20px right of and below the pointer, and on the other side
 * of it where it would run past the chart's right or bottom edge. Portaled to `<body>` like the
 * popovers, so the chart card, which clips its content, doesn't cut it off.
 */
export function ChartTooltip({ pointer, box, title, rows }: ChartTooltipProps) {
  const { theme } = useBlockKit();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useClientLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width !== size?.width || height !== size?.height) setSize({ width, height });
  });

  // ECharts' rule, in the chart's own coordinates: past the right edge (with 2px to spare) it
  // opens left of the pointer, past the bottom edge above it.
  let left = pointer.x + GAP;
  let top = pointer.y + GAP;
  if (size) {
    if (pointer.x - box.left + GAP + size.width + 2 > box.width)
      left = pointer.x - GAP - size.width;
    if (pointer.y - box.top + GAP + size.height > box.height) top = pointer.y - GAP - size.height;
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className="sbk-root sbk-chart-tooltip"
      data-theme={theme}
      role="tooltip"
      style={{ left, top, visibility: size ? undefined : "hidden" }}
    >
      {title !== undefined ? <div className="sbk-chart-tooltip__title">{title}</div> : null}
      <div className="sbk-chart-tooltip__rows">
        {rows.map((row) => (
          <div key={row.name} className="sbk-chart-tooltip__row">
            <span className="sbk-chart-tooltip__dot" style={{ backgroundColor: row.color }} />
            <span className="sbk-chart-tooltip__name">{row.name}</span>
            <span className="sbk-chart-tooltip__value">{row.value.toLocaleString("en-US")}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
