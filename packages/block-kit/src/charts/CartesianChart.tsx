import { areaFillForIndex, colorForIndex } from "./palette";
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
const LABELS_Y = 342;

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
  const leftMargin = leftMarginFor(scale.ticks);
  // Slack's line and area plots stop 10.7675px short of the edge, leaving room for half the last
  // category label; bars fill the width.
  const rightMargin = type === "bar" ? 0 : 10.7675;
  const plotLeft = leftMargin;
  const plotRight = Math.max(plotLeft + 1, width - rightMargin);
  const plotWidth = plotRight - plotLeft;

  const y = (v: number) =>
    PLOT_BOTTOM - ((v - scale.min) / (scale.max - scale.min)) * (PLOT_BOTTOM - PLOT_TOP);
  const zeroY = y(0);

  const n = categories.length;
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

  return (
    <div className="sbk-chart" ref={ref}>
      <svg
        className="sbk-chart__svg"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Chart"
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
          {categories.map((c, i) => (
            <text
              key={c}
              transform={`translate(${type === "bar" ? bandCenterX(i) : pointX(i)} ${LABELS_Y})`}
              y={9}
              textAnchor="middle"
              dominantBaseline="central"
              className="sbk-chart__tick"
            >
              {c}
            </text>
          ))}

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
                      d={roundedBarPath(x, top, barWidth, bottom, 4, positive)}
                      fill={colorForIndex(si)}
                    />
                  );
                }),
              )
            : series.map((s, si) => {
                const points = s.data.map((d, i) => ({ x: pointX(i), y: y(d.value) }));
                const color = colorForIndex(si);
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
                      d={smoothLinePath(points)}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinejoin="bevel"
                    />
                  </g>
                );
              })}
        </g>
      </svg>
    </div>
  );
}
