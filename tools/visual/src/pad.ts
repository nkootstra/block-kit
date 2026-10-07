/**
 * Padding a screenshot to the size of the one it's compared with. The reference's message can be
 * wider than ours (Slack's message includes a 36px gutter on the right), so the narrower image is
 * padded with the page's background: white for light references, the reference's page colour for
 * dark ones, where white would count the whole strip as a mismatch.
 */
import { PNG } from "pngjs";

export type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];

export function pad(png: PNG, width: number, height: number, background: Rgb = WHITE): PNG {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) out.data.set([...background, 255], i * 4);
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

/** An `rgb()`/`rgba()` or hex colour as RGB, ignoring alpha; undefined for anything else. */
export function parseRgb(color: string): Rgb | undefined {
  const rgb = color.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return undefined;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb;
}
