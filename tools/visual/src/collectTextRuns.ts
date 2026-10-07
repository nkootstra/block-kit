import type { TextRun } from "./textRuns";

/**
 * Reads every visible text node under the elements `selector` matches as a `TextRun`, positioned
 * relative to the first of them: the message, then any menu or calendar open over it (a list such
 * as `#sbk-render > *, .sbk-popover > *`). Runs in the page through `page.evaluate`, so it must
 * stay self-contained.
 */
export function collectTextRuns(selector: string): TextRun[] {
  const matches = [...document.querySelectorAll(selector)];
  const roots = matches.filter((el, i) => !matches.slice(0, i).some((m) => m.contains(el)));
  const first = roots[0];
  if (!first) throw new Error(`no element matches ${selector}`);
  const origin = first.getBoundingClientRect();

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

  // A reference keeps its motion in the meta (snapshot.js leaves it out of the inlined styles);
  // one captured before snapshots recorded motion has no `motion` there, and its runs get none.
  const metaElement = document.getElementById("sbk-reference-meta");
  const recorded: Record<string, Record<string, string>> | undefined = metaElement
    ? JSON.parse(metaElement.textContent ?? "{}").motion
    : undefined;
  const knowsMotion = !metaElement || recorded !== undefined;

  // "transition <property> <duration> <easing> <delay>; animation <name> …" for whatever moves,
  // or "" for nothing. Easings hold commas (cubic-bezier), so lists split outside parentheses.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const describeMotion = (get: (prop: string) => string | undefined): string => {
    const list = (prop: string, fallback: string) =>
      (get(prop) ?? fallback).split(/,\s*(?![^(]*\))/);
    const at = (values: string[], i: number) => values[i % values.length] ?? "";
    const parts: string[] = [];
    const properties = list("transition-property", "all");
    const durations = list("transition-duration", "0s");
    const easings = list("transition-timing-function", "ease");
    const delays = list("transition-delay", "0s");
    properties.forEach((property, i) => {
      const duration = at(durations, i);
      if (duration === "0s") return;
      parts.push(`transition ${property} ${duration} ${at(easings, i)} ${at(delays, i)}`);
    });
    const names = list("animation-name", "none");
    const animationDurations = list("animation-duration", "0s");
    const animationEasings = list("animation-timing-function", "ease");
    const iterations = list("animation-iteration-count", "1");
    names.forEach((name, i) => {
      if (name === "none") return;
      parts.push(
        `animation ${name} ${at(animationDurations, i)} ${at(animationEasings, i)} ${at(iterations, i)}`,
      );
    });
    return parts.join("; ");
  };
  const motionOf = (el: Element, root: Element): string | undefined => {
    if (!knowsMotion) return undefined;
    for (let e: Element | null = el; e && root.contains(e); e = e.parentElement) {
      const entry = recorded?.[e.getAttribute("data-ref") ?? ""];
      const style = recorded ? undefined : getComputedStyle(e);
      const described = recorded
        ? entry
          ? describeMotion((prop) => entry[prop])
          : ""
        : describeMotion((prop) => style?.getPropertyValue(prop));
      if (described) return described;
    }
    return "";
  };

  const runs: TextRun[] = [];
  const range = document.createRange();
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      const el = node.parentElement;
      if (!text || !el) continue;
      const style = getComputedStyle(el);
      if (style.visibility !== "visible") continue;
      // Measure the glyphs, not the spaces around them: a space inside a text node or in a node of
      // its own renders the same, but would move the run's edge by a space's width.
      const raw = node.textContent ?? "";
      range.setStart(node, raw.search(/\S/));
      range.setEnd(node, raw.trimEnd().length);
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
        motion: motionOf(el, root),
      });
    }
  }
  return runs;
}
