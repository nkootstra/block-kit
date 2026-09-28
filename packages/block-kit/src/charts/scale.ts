/**
 * Linear "nice tick" scale for the chart y-axis, reverse-engineered from Slack's Builder:
 * it always aims for ~6 intervals, picking the smallest step from {1, 2, 3, 5, 10} * 10^n
 * that covers the data range, and always includes 0.
 */
export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

const STEP_CANDIDATES = [1, 2, 3, 5, 10];

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const candidate = STEP_CANDIDATES.find((c) => c >= norm - 1e-9) ?? 10;
  return candidate * mag;
}

export function niceLinearScale(dataMin: number, dataMax: number, targetIntervals = 6): NiceScale {
  const min = Math.min(0, dataMin);
  const max = Math.max(0, dataMax === dataMin ? dataMin + 1 : dataMax);
  const step = niceStep((max - min) / targetIntervals);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 1e-6; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

/** Matches Slack's `1,200`-style tick labels. */
export function formatTick(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Where Slack's chart library draws a 1px horizontal line meant for `y`: the nearest half pixel, so
 * the stroke fills exactly one pixel row, rounding up when `y` sits on a row boundary.
 */
export function crispLine(y: number): number {
  const doubled = Math.round(y * 2);
  return doubled % 2 === 1 ? doubled / 2 : (doubled + 1) / 2;
}
