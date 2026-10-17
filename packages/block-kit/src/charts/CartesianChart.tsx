import { type PointerEvent, useState } from "react";
import { ChartTooltip } from "./ChartTooltip";
import { useLastValue } from "./useLastValue";
import { areaFillForIndex, colorForIndex, liftedColorForIndex } from "./palette";
import { roundedBarPath, smoothLinePath } from "./paths";
import { crispLine, formatTick, niceLinearScale } from "./scale";
import { useContainerWidth } from "./useContainerWidth";

export interface ChartSeries {
  name: string;
  data: { label: string; value: number }[];
}

const HEIGHT = 360;
const PLOT_TOP = 9;
const PLOT_BOTTOM = 334;
// When the category labels don't fit side by side, Slack turns them 45° and gives them more room:
// the plot spans 17–282.4817 instead of 9–334, and the first label sits at x 86.2 or further in
// (extra/fidelity/data-visualization/many-items, at 406 and 374px wide).
const ROTATED_PLOT_TOP = 17;
const ROTATED_PLOT_BOTTOM = 282.4817;
const ROTATED_FIRST_LABEL_X = 86.21;
/** The category labels sit this far below the plot. */
const LABELS_GAP = 8;
/** About how wide a 13px label character is; an estimate, so the server and browser agree. */
const LABEL_CHAR_WIDTH = 7.5;
/** The dashed line Slack's charts draw at the category under the pointer (ECharts' axis pointer). */
const POINTER_COLOR = "#b7b9be";

interface Hover {
  index: number;
  pointer: { x: number; y: number };
  box: { left: number; top: number; width: number; height: number };
}

// Measured across every reference fixture — from 2-digit negative deltas ("-2") to 5-character
// values ("1,800") — Slack always reserves a fixed 74px gutter for the y-axis label + tick
// numbers, rather than sizing it to the tick text. `ticks` is kept as a parameter so a future
// fixture with unusually long labels can widen this without changing every call site.
function leftMarginFor(ticks: number[]): number {
  const maxLen = Math.max(...ticks.map((t) => formatTick(t).length), 1);
  return Math.max(74, 34 + maxLen * 8);
}

export function CartesianChart({
  type,
  series,
  categories,
}: {
  type: "line" | "area" | "bar";
  series: ChartSeries[];
  categories: string[];
}) {
  const { ref, width } = useContainerWidth(406);
  const allValues = series.flatMap((s) => s.data.map((d) => d.value));
  const scale = niceLinearScale(Math.min(0, ...allValues), Math.max(0, ...allValues));
  // Slack's line and area plots stop 10.7675px short of the edge, leaving room for half the last
  // category label; bars fill the width.
  const rightMargin = type === "bar" ? 0 : 10.7675;
  const n = categories.length;
  // The room each label has: a bar's band, or the distance between two points.
  const slots = type === "bar" ? n : n - 1;
  const room = (left: number) => (slots > 0 ? (width - rightMargin - left) / slots : Infinity);
  const longestLabel = Math.max(0, ...categories.map((c) => c.length)) * LABEL_CHAR_WIDTH;
  const rotated = longestLabel > room(leftMarginFor(scale.ticks));
  // Turned labels hang down to the left of their category, so the first one pushes the plot in.
  // Its x is the plot's left edge plus half a band for bars, the edge itself for points.
  const firstLabelOffset = type === "bar" ? 1 / (2 * n) : 0;
  const plotLeft = rotated
    ? Math.max(
        leftMarginFor(scale.ticks),
        (ROTATED_FIRST_LABEL_X - (width - rightMargin) * firstLabelOffset) / (1 - firstLabelOffset),
      )
    : leftMarginFor(scale.ticks);
  const plotRight = Math.max(plotLeft + 1, width - rightMargin);
  const plotWidth = plotRight - plotLeft;
  const plotTop = rotated ? ROTATED_PLOT_TOP : PLOT_TOP;
  const plotBottom = rotated ? ROTATED_PLOT_BOTTOM : PLOT_BOTTOM;
  const labelsY = plotBottom + LABELS_GAP;

  const y = (v: number) =>
    plotBottom - ((v - scale.min) / (scale.max - scale.min)) * (plotBottom - plotTop);
  const zeroY = y(0);

  const bandWidth = n > 0 ? plotWidth / n : plotWidth;
  const pointX = (i: number) =>
    n > 1 ? plotLeft + (i * plotWidth) / (n - 1) : plotLeft + plotWidth / 2;
  const bandCenterX = (i: number) => plotLeft + bandWidth * (i + 0.5);

  // Measured from Slack's Builder: a lone bar occupies ~69% of its category band, while a
  // grouped set of bars (with a small gap scaling with bar width) occupies ~73%.
  const groupWidth = bandWidth * (series.length > 1 ? 0.73 : 0.69);
  const barGapRatio = 0.1;
  const barWidth =
    series.length > 0
      ? Math.max(1, groupWidth / (series.length + (series.length - 1) * barGapRatio))
      : 0;
  const barGap = barWidth * barGapRatio;

  // Over the plot, the pointer picks a category: the band it's in for bars, the nearest point for
  // lines and areas. Touch screens don't hover, so only a mouse or pen shows it.
  const [hover, setHover] = useState<Hover | null>(null);
  const categoryX = (i: number) => (type === "bar" ? bandCenterX(i) : pointX(i));
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "touch" || n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) * width) / rect.width;
    const py = ((e.clientY - rect.top) * HEIGHT) / rect.height;
    if (px < plotLeft || px > plotRight || py < plotTop || py > plotBottom) {
      setHover(null);
      return;
    }
    const step = type === "bar" ? bandWidth : n > 1 ? plotWidth / (n - 1) : plotWidth;
    const raw = (px - plotLeft) / step;
    const index = Math.max(0, Math.min(n - 1, type === "bar" ? Math.floor(raw) : Math.round(raw)));
    setHover({
      index,
      pointer: { x: e.clientX, y: e.clientY },
      box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  }
  const hovered = hover?.index;
  // The tooltip keeps the last category it showed while it fades out.
  const shown = useLastValue(hover);

  return (
    <div className={rotated ? "sbk-chart sbk-chart--rotated" : "sbk-chart"} ref={ref}>
      <svg
        className="sbk-chart__svg"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Chart"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <g>
          {scale.ticks.map((t) => (
            <line
              key={t}
              x1={plotLeft}
              x2={plotRight}
              y1={crispLine(y(t))}
              y2={crispLine(y(t))}
              stroke="rgba(94,93,96,0.13)"
            />
          ))}
          {/* Slack draws the x axis over the zero gridline, darkening it. */}
          <line
            className="sbk-chart__axis"
            x1={plotLeft}
            x2={plotRight}
            y1={crispLine(zeroY)}
            y2={crispLine(zeroY)}
            stroke="rgba(94,93,96,0.13)"
            strokeLinecap="round"
          />
          {scale.ticks.map((t) => (
            <text
              key={t}
              transform={`translate(${plotLeft - 8} ${y(t)})`}
              textAnchor="end"
              dominantBaseline="central"
              className="sbk-chart__tick"
            >
              {formatTick(t)}
            </text>
          ))}
          {categories.map((c, i) =>
            rotated ? (
              <text
                key={c}
                transform={`translate(${categoryX(i)} ${labelsY}) rotate(-45)`}
                textAnchor="end"
                dominantBaseline="central"
                className="sbk-chart__tick"
              >
                {c}
              </text>
            ) : (
              <text
                key={c}
                transform={`translate(${categoryX(i)} ${labelsY})`}
                y={9}
                textAnchor="middle"
                dominantBaseline="central"
                className="sbk-chart__tick"
              >
                {c}
              </text>
            ),
          )}

          {type === "bar"
            ? series.map((s, si) =>
                s.data.map((d, i) => {
                  const x = bandCenterX(i) - groupWidth / 2 + si * (barWidth + barGap);
                  const positive = d.value >= 0;
                  const top = positive ? y(d.value) : zeroY;
                  const bottom = positive ? zeroY : y(d.value);
                  return (
                    <path
                      key={`${si}-${i}`}
                      className="sbk-chart__bar"
                      d={roundedBarPath(x, top, barWidth, bottom, 4, positive)}
                      // Slack lifts every bar in the hovered category.
                      style={{ fill: i === hovered ? liftedColorForIndex(si) : colorForIndex(si) }}
                    />
                  );
                }),
              )
            : series.map((s, si) => {
                const points = s.data.map((d, i) => ({ x: pointX(i), y: y(d.value) }));
                // A hovered line chart lifts all its lines; an area chart keeps its colours.
                const color =
                  type === "line" && hovered !== undefined
                    ? liftedColorForIndex(si)
                    : colorForIndex(si);
                return (
                  <g key={si}>
                    {type === "area" ? (
                      <path
                        d={`${smoothLinePath(points)}L${points[points.length - 1]?.x ?? 0} ${zeroY}L${points[0]?.x ?? 0} ${zeroY}Z`}
                        style={{ fill: areaFillForIndex(si) }}
                        fillOpacity={0.7}
                      />
                    ) : null}
                    <path
                      className="sbk-chart__line"
                      d={smoothLinePath(points)}
                      fill="none"
                      style={{ stroke: color }}
                      strokeWidth={2}
                      strokeLinejoin="bevel"
                    />
                  </g>
                );
              })}
          {hovered !== undefined ? (
            <line
              className="sbk-chart__pointer"
              x1={crispLine(categoryX(hovered))}
              x2={crispLine(categoryX(hovered))}
              y1={plotTop}
              y2={plotBottom}
              stroke={POINTER_COLOR}
              strokeDasharray="4 2"
            />
          ) : null}
        </g>
      </svg>
      {shown ? (
        <ChartTooltip
          open={hover !== null}
          pointer={shown.pointer}
          box={shown.box}
          title={categories[shown.index]}
          rows={series.map((s, si) => ({
            name: s.name,
            value:
              s.data.find((d) => d.label === categories[shown.index])?.value ??
              s.data[shown.index]?.value ??
              0,
            color: colorForIndex(si),
          }))}
        />
      ) : null}
    </div>
  );
}
