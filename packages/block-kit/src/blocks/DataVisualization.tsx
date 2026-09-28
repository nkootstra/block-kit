import { CartesianChart, type ChartSeries } from "../charts/CartesianChart";
import { PieChart } from "../charts/PieChart";
import { colorForIndex } from "../charts/palette";
import { ChartActions } from "../data/HoverActions";
import type { BlockProps, Json } from "../types";

interface AxisConfig {
  categories?: string[];
  x_label?: string;
  y_label?: string;
}

interface Chart extends Json {
  type: "line" | "area" | "bar" | "pie";
  series?: ChartSeries[];
  segments?: { label: string; value: number }[];
  axis_config?: AxisConfig;
}

interface DataVisualizationBlock extends Json {
  type: "data_visualization";
  title?: string;
  chart: Chart;
}

/** The chart's data as a table: a label column plus one column per series (or a value column). */
function chartRows(chart: Chart, categories: string[]): string[][] {
  if (chart.type === "pie") {
    return [["Label", "Value"], ...(chart.segments ?? []).map((s) => [s.label, String(s.value)])];
  }
  const series = chart.series ?? [];
  return [
    [chart.axis_config?.x_label ?? "", ...series.map((s) => s.name)],
    ...categories.map((label, i) => [
      label,
      ...series.map((s) =>
        String(s.data.find((d) => d.label === label)?.value ?? s.data[i]?.value ?? ""),
      ),
    ]),
  ];
}

function legendEntries(chart: Chart): { name: string; color: string }[] {
  if (chart.type === "pie") {
    return (chart.segments ?? []).map((s, i) => ({ name: s.label, color: colorForIndex(i) }));
  }
  return (chart.series ?? []).map((s, i) => ({ name: s.name, color: colorForIndex(i) }));
}

export function DataVisualization({ block }: BlockProps<DataVisualizationBlock>) {
  const chart = block.chart;
  if (!chart) return null;
  const isPie = chart.type === "pie";
  const categories =
    chart.axis_config?.categories ?? chart.series?.[0]?.data.map((d) => d.label) ?? [];
  const legend = legendEntries(chart);

  return (
    <div className="sbk-dataviz sbk-hover-actions-host">
      {block.title ? <h3 className="sbk-dataviz__title">{block.title}</h3> : null}
      <div className={isPie ? "sbk-dataviz__body sbk-dataviz__body--pie" : "sbk-dataviz__body"}>
        {!isPie && chart.axis_config?.y_label ? (
          <div className="sbk-dataviz__y-label">{chart.axis_config.y_label}</div>
        ) : null}
        {chart.type === "pie" ? (
          <PieChart segments={chart.segments ?? []} />
        ) : (
          <CartesianChart type={chart.type} series={chart.series ?? []} categories={categories} />
        )}
      </div>
      {!isPie && chart.axis_config?.x_label ? (
        <div className="sbk-dataviz__x-label">{chart.axis_config.x_label}</div>
      ) : null}
      {legend.length > 0 ? (
        <div
          className={isPie ? "sbk-dataviz__legend sbk-dataviz__legend--pie" : "sbk-dataviz__legend"}
        >
          {legend.map((entry) => (
            <span key={entry.name} className="sbk-dataviz__legend-entry">
              <span className="sbk-dataviz__legend-dot" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
          ))}
        </div>
      ) : null}
      <ChartActions rows={chartRows(chart, categories)} title={block.title} />
    </div>
  );
}
