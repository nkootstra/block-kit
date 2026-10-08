import { useState } from "react";
import { CartesianChart, type ChartSeries } from "../charts/CartesianChart";
import { ChartTableModal } from "../charts/ChartTableModal";
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

/**
 * The chart's data as Slack tabulates it for "View as table" and "Download chart data": a pie's
 * segments under "Label" and "Value", otherwise one row per series under "Series" and the
 * categories. Values are written as given ("1500", not "1,500").
 */
function chartTable(chart: Chart, categories: string[]): string[][] {
  if (chart.type === "pie") {
    return [["Label", "Value"], ...(chart.segments ?? []).map((s) => [s.label, String(s.value)])];
  }
  return [
    ["Series", ...categories],
    ...(chart.series ?? []).map((s) => [
      s.name,
      ...categories.map((label, i) =>
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
  const [tableOpen, setTableOpen] = useState(false);
  const chart = block.chart;
  if (!chart) return null;
  const isPie = chart.type === "pie";
  const categories =
    chart.axis_config?.categories ?? chart.series?.[0]?.data.map((d) => d.label) ?? [];
  const legend = legendEntries(chart);
  const rows = chartTable(chart, categories);

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
      <ChartActions rows={rows} title={block.title} onViewTable={() => setTableOpen(true)} />
      {tableOpen ? (
        <ChartTableModal title={block.title} rows={rows} onClose={() => setTableOpen(false)} />
      ) : null}
    </div>
  );
}
