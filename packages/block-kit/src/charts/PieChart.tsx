import { colorForIndex } from "./palette";

export interface PieSegment {
  label: string;
  value: number;
}

const WIDTH = 406;
/** Builder's pie plot area is 406×360, not square, with the pie centred in it. */
const HEIGHT = 360;
const CENTER = { x: 203, y: 180 };
const RADIUS = 144;

/** Point on the pie's circle for a given angle in degrees, measured clockwise from 12 o'clock. */
function pointAt(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER.x + RADIUS * Math.cos(rad), y: CENTER.y + RADIUS * Math.sin(rad) };
}

function segmentPath(startAngle: number, endAngle: number): string {
  const sweep = endAngle - startAngle;
  const start = pointAt(startAngle);
  const end = pointAt(endAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  if (sweep >= 359.999) {
    // A full circle, drawn as Slack's chart library does: one arc stopping 1e-4 rad short of its
    // start, with no edge to the centre (which would show as a white seam under the stroke).
    const stop = pointAt(startAngle + 360 - (1e-4 * 180) / Math.PI);
    const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
    return `M${r4(start.x)} ${r4(start.y)}A${RADIUS} ${RADIUS} 0 1 1 ${r4(stop.x)} ${r4(stop.y)}Z`;
  }
  return `M${CENTER.x} ${CENTER.y}L${start.x} ${start.y}A${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}Z`;
}

export function PieChart({ segments }: { segments: PieSegment[] }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  let angle = 0;
  const arcs = segments.map((segment, i) => {
    const value = Math.max(0, segment.value);
    const sweep = total > 0 ? (value / total) * 360 : 0;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { key: i, d: segmentPath(start, end), color: colorForIndex(i) };
  });

  return (
    <svg
      className="sbk-chart__svg sbk-chart__svg--pie"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Pie chart"
    >
      {arcs.map((arc) => (
        <path
          key={arc.key}
          d={arc.d}
          fill={arc.color}
          // Slack separates slices in the page colour: white, or #1a1d21 in dark.
          style={{ stroke: "var(--sbk-bg)" }}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
