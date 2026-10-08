/** How many series colours Slack cycles through. */
const COLORS = 4;

/**
 * A series or segment colour, as a token per theme (DataVisualization.css, and Message.css for
 * dark): Slack's dark charts use a deeper set. SVG presentation attributes don't resolve `var()`,
 * so apply it through `style`.
 */
export function colorForIndex(i: number): string {
  return `var(--sbk-chart-${(i % COLORS) + 1})`;
}

/** The colour a hovered mark lifts to: each channel of the series colour x 1.1, rounded down. */
export function liftedColorForIndex(i: number): string {
  return `var(--sbk-chart-${(i % COLORS) + 1}-lift)`;
}

/**
 * Fill of a series' area, as a token per theme (DataVisualization.css, and Message.css for dark):
 * a light tint of the series colour, or a dark one.
 */
export function areaFillForIndex(i: number): string {
  return `var(--sbk-chart-area-${(i % COLORS) + 1})`;
}
