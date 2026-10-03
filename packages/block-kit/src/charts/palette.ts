/** Series/segment colours, in order, measured from Slack's Builder charts. */
export const CHART_COLORS = ["#e96825", "#20a271", "#c474d3", "#0e9dd3"];

/**
 * Fill of a series' area, as a token per theme (DataVisualization.css, and Message.css for dark):
 * a light tint of the series colour, or a dark one.
 */
export function areaFillForIndex(i: number): string {
  return `var(--sbk-chart-area-${(i % CHART_COLORS.length) + 1})`;
}

export function colorForIndex(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length] ?? "#e96825";
}
