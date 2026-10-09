import { type PointerEvent, useState } from "react";
import { ChartTooltip } from "./ChartTooltip";
import { colorForIndex, liftedColorForIndex } from "./palette";
import { useLastValue } from "./useLastValue";

export interface PieSegment {
  label: string;
  value: number;
}

const WIDTH = 406;
/** Builder's pie plot area is 406×360, not square, with the pie centred in it. */
const HEIGHT = 360;
const CENTER = { x: 203, y: 180 };
const RADIUS = 144;
/** How much a hovered slice grows, measured in Block Kit Builder (ECharts' `scaleSize`). */
const HOVER_GROWTH = 5;

/** Point on the pie's circle for a given angle in degrees, measured clockwise from 12 o'clock. */
function pointAt(angleDeg: number, radius = RADIUS) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER.x + radius * Math.cos(rad), y: CENTER.y + radius * Math.sin(rad) };
}

function segmentPath(startAngle: number, endAngle: number, radius = RADIUS): string {
  const sweep = endAngle - startAngle;
  const start = pointAt(startAngle, radius);
  const end = pointAt(endAngle, radius);
  const largeArc = sweep > 180 ? 1 : 0;
  if (sweep >= 359.999) {
    // A full circle, drawn as Slack's chart library does: one arc stopping 1e-4 rad short of its
    // start, with no edge to the centre (which would show as a white seam under the stroke).
    const stop = pointAt(startAngle + 360 - (1e-4 * 180) / Math.PI, radius);
    const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
    return `M${r4(start.x)} ${r4(start.y)}A${radius} ${radius} 0 1 1 ${r4(stop.x)} ${r4(stop.y)}Z`;
  }
  return `M${CENTER.x} ${CENTER.y}L${start.x} ${start.y}A${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}Z`;
}

interface Hover {
  index: number;
  pointer: { x: number; y: number };
  box: { left: number; top: number; width: number; height: number };
}

export function PieChart({ segments }: { segments: PieSegment[] }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  let angle = 0;
  const arcs = segments.map((segment, i) => {
    const value = Math.max(0, segment.value);
    const sweep = total > 0 ? (value / total) * 360 : 0;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const hovered = hover?.index === i;
    return {
      key: i,
      hovered,
      // Slack lifts the slice under the pointer and grows it 5px.
      d: segmentPath(start, end, hovered ? RADIUS + HOVER_GROWTH : RADIUS),
      color: hovered ? liftedColorForIndex(i) : colorForIndex(i),
    };
  });
  // The hovered slice is drawn last, over its neighbours' separators.
  const ordered = [...arcs.filter((a) => !a.hovered), ...arcs.filter((a) => a.hovered)];

  // Touch screens don't hover, so only a mouse or pen shows it.
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch") return;
    const index = (e.target as Element).getAttribute("data-index");
    if (index === null) {
      setHover(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({
      index: Number(index),
      pointer: { x: e.clientX, y: e.clientY },
      box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  }

  // The tooltip keeps the last slice it showed while it fades out.
  const shown = useLastValue(hover);
  const segment = shown ? segments[shown.index] : undefined;
  return (
    <>
      <svg
        className="sbk-chart__svg sbk-chart__svg--pie"
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Pie chart"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        {ordered.map((arc) => (
          <path
            key={arc.key}
            className="sbk-chart__slice"
            data-index={arc.key}
            data-hovered={arc.hovered || undefined}
            d={arc.d}
            // Slack separates slices in the page colour: white, or #1a1d21 in dark.
            style={{ fill: arc.color, stroke: "var(--sbk-bg)" }}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {shown && segment ? (
        <ChartTooltip
          open={hover !== null}
          pointer={shown.pointer}
          box={shown.box}
          rows={[{ name: segment.label, value: segment.value, color: colorForIndex(shown.index) }]}
        />
      ) : null}
    </>
  );
}
