/**
 * Where to crop an open-state comparison. A reference with a popover (a select list, the
 * calendar, the time list, the overflow menu) shows the message with the popover laid over it;
 * both sides are cropped to one box, relative to the message, that holds both sides' message and
 * popovers, so a popover a few pixels off shows as a diff instead of shifting the whole image.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A frozen popover or dialog, as snapshot.js records it in the reference's meta. */
export interface Layer extends Box {
  kind: "popover" | "dialog";
}

/** The union of each side's boxes (message first, then its popovers), relative to the message. */
export function cropBox(reference: Box[], ours: Box[]): Box {
  const all = [...reference, ...ours];
  const left = Math.min(...all.map((b) => b.x));
  const top = Math.min(...all.map((b) => b.y));
  const right = Math.max(...all.map((b) => b.x + b.width));
  const bottom = Math.max(...all.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Our popovers keep this far from the window's edges (Popover.tsx). */
const EDGE = 8;

/**
 * How far to move our message from the page's top-left corner so a popover that sticks out of it
 * in Slack has room, and isn't pushed inward by our window-edge clamp.
 */
export function roomFor(layers: Layer[]): { left: number; top: number } {
  const popovers = layers.filter((l) => l.kind === "popover");
  if (popovers.length === 0) return { left: 0, top: 0 };
  const overhangLeft = Math.max(0, ...popovers.map((l) => -l.x));
  const overhangTop = Math.max(0, ...popovers.map((l) => -l.y));
  return {
    left: overhangLeft > 0 ? overhangLeft + 2 * EDGE : 0,
    top: overhangTop + 2 * EDGE,
  };
}
