import type { TextRun } from "./textRuns";

/**
 * Reads every visible text node under `selector` as a `TextRun`, positioned relative to that root.
 * Runs in the page through `page.evaluate`, so it must stay self-contained.
 */
export function collectTextRuns(selector: string): TextRun[] {
  const root = document.querySelector(selector);
  if (!root) throw new Error(`no element matches ${selector}`);
  const origin = root.getBoundingClientRect();

  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const parse = (css: string): number[] | null => {
    const parts = css
      .match(/^rgba?\(([^)]*)\)$/)?.[1]
      ?.split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (!parts || parts.length < 3) return null;
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  };

  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    const el = node.parentElement;
    if (!text || !el) continue;
    const style = getComputedStyle(el);
    if (style.visibility !== "visible") continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    // Multiply the opacities up the tree and stack the background colours, outermost first, on
    // the white page.
    let opacity = 1;
    const layers: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      opacity *= Number(s.opacity);
      layers.push(s.backgroundColor);
    }
    let background = [255, 255, 255];
    for (const layer of layers.toReversed()) {
      const c = parse(layer);
      if (!c) continue;
      const a = c[3] ?? 1;
      background = background.map((channel, k) => (c[k] ?? 0) * a + channel * (1 - a));
    }

    runs.push({
      text,
      x: rect.x - origin.x,
      y: rect.y - origin.y,
      width: rect.width,
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight),
      fontStyle: style.fontStyle,
      color: style.color,
      opacity,
      background: `rgb(${background.map(Math.round).join(", ")})`,
    });
  }
  return runs;
}
