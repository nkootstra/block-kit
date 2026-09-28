/** Series/segment colours, in order, measured from Slack's Builder charts. */
export const CHART_COLORS = ["#e96825", "#20a271", "#c474d3", "#0e9dd3"];

/** Area-fill tints for the first two palette colours (measured); others get an approximation. */
const AREA_FILLS: Record<string, string> = {
  "#e96825": "rgb(255,237,229)",
  "#20a271": "rgb(227,255,243)",
};

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Fill colour for a series' area, tinted ~88% toward white when not one of the measured pairs. */
export function areaFillFor(color: string): string {
  const known = AREA_FILLS[color.toLowerCase()];
  if (known) return known;
  const [r, g, b] = hexToRgb(color);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.88);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export function colorForIndex(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length] ?? "#e96825";
}
