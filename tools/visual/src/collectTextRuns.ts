import type { TextRun } from "./textRuns";

/**
 * Reads each line of visible text under the elements `selector` matches as a `TextRun`, positioned
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

  // Text an ancestor with overflow other than `visible` cuts off entirely (a time list's options
  // scrolled out of its box) isn't on screen. Where each side happens to scroll says nothing about
  // how it renders, so such runs aren't read; one an edge only cuts through still is.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const clipped = (el: Element, rect: DOMRect): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      const clipsX = s.overflowX !== "visible";
      const clipsY = s.overflowY !== "visible";
      if (!clipsX && !clipsY) continue;
      const box = e.getBoundingClientRect();
      const left = box.left + e.clientLeft;
      const top = box.top + e.clientTop;
      if (clipsX && (rect.right <= left || rect.left >= left + e.clientWidth)) return true;
      if (clipsY && (rect.bottom <= top || rect.top >= top + e.clientHeight)) return true;
    }
    return false;
  };

  // Text only a screen reader gets (our .sbk-visually-hidden, the usual sr-only patterns): an
  // element or ancestor clipped to nothing by `clip-path: inset(50%)` or a collapsed `clip`, or
  // shrunk to a box of a pixel or less that doesn't show its overflow.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const visuallyHidden = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.clipPath.startsWith("inset(50%")) return true;
      const clip = s.clip
        .match(/^rect\(([^)]*)\)$/)?.[1]
        ?.split(/[\s,]+/)
        .map(Number.parseFloat);
      if (clip?.length === 4 && clip.every(Number.isFinite)) {
        const [top = 0, right = 0, bottom = 0, left = 0] = clip;
        if (right - left <= 1 || bottom - top <= 1) return true;
      }
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const box = e.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) return true;
      }
    }
    return false;
  };

  // The product of the element's and its ancestors' opacities.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const opacityOf = (el: Element): number => {
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement)
      opacity *= Number(getComputedStyle(e).opacity);
    return opacity;
  };

  // One range per line the text paints on, from its first visible character to its last: wrapped
  // text and a <pre>'s newlines read line by line, as Slack's <br>-broken lines do, and a line an
  // ancestor clips away (a table cell clamped to one line) can be left out on its own. Measuring
  // the glyphs, not the spaces around them, keeps a space inside a text node or in a node of its
  // own from moving the run's edge by a space's width.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const lineRanges = (nodes: Text[]): Range[] => {
    const lines: Array<{ range: Range; top: number; bottom: number }> = [];
    const probe = document.createRange();
    for (const textNode of nodes) {
      const data = textNode.data;
      for (let i = 0; i < data.length;) {
        const code = data.codePointAt(i) ?? 0;
        const end = i + (code > 0xffff ? 2 : 1);
        if (!/\s/.test(data.slice(i, end))) {
          probe.setStart(textNode, i);
          probe.setEnd(textNode, end);
          const box = [...probe.getClientRects()].find((r) => r.width > 0 || r.height > 0);
          if (box) {
            const middle = box.top + box.height / 2;
            const line = lines.at(-1);
            if (line && middle >= line.top && middle <= line.bottom) {
              line.range.setEnd(textNode, end);
              line.top = Math.min(line.top, box.top);
              line.bottom = Math.max(line.bottom, box.bottom);
            } else {
              const range = document.createRange();
              range.setStart(textNode, i);
              range.setEnd(textNode, end);
              lines.push({ range, top: box.top, bottom: box.bottom });
            }
          }
        }
        i = end;
      }
    }
    return lines.map((line) => line.range);
  };

  const runs: TextRun[] = [];
  const range = document.createRange();

  // A field's value has no text node, so it's laid out in a stand-in box with the field's own
  // geometry and font (single-line fields centre their line; a textarea starts at the top) and
  // measured there. Slack shows some values in an <input> where we draw text, and the other way
  // round; this way both read as the same run.
  const FIELD_STYLES = [
    "box-sizing",
    "width",
    "height",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "letter-spacing",
    "word-spacing",
    "line-height",
    "text-indent",
    "text-transform",
    "white-space",
  ];
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate only sends this function
  const fieldValueRect = (field: HTMLInputElement | HTMLTextAreaElement, text: string) => {
    const style = getComputedStyle(field);
    const box = field.getBoundingClientRect();
    const standIn = document.createElement("div");
    for (const prop of FIELD_STYLES) standIn.style.setProperty(prop, style.getPropertyValue(prop));
    standIn.style.position = "fixed";
    standIn.style.left = `${box.left}px`;
    standIn.style.top = `${box.top}px`;
    standIn.style.margin = "0";
    standIn.style.visibility = "hidden";
    standIn.style.overflow = "hidden";
    standIn.style.display = "flex";
    standIn.style.alignItems = field.localName === "textarea" ? "flex-start" : "center";
    standIn.style.justifyContent =
      style.textAlign === "center"
        ? "center"
        : /right|end/.test(style.textAlign)
          ? "flex-end"
          : "flex-start";
    const textNode = document.createTextNode(text);
    standIn.append(textNode);
    document.body.append(standIn);
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();
    standIn.remove();
    return rect;
  };

  // A reference keeps each placeholder's colour in a `[data-ref="…"]::placeholder` rule; one
  // captured before snapshots did paints placeholders in the browser's grey, not Slack's colour.
  let recordedPlaceholders: Set<string> | undefined;
  const placeholderColorKnown = (field: Element): boolean => {
    if (!metaElement) return true;
    if (!recordedPlaceholders) {
      recordedPlaceholders = new Set();
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) {
          const ref = (rule as CSSStyleRule).selectorText?.match(
            /^\[data-ref="([^"]+)"\]::placeholder$/,
          )?.[1];
          if (ref) recordedPlaceholders.add(ref);
        }
      }
    }
    return recordedPlaceholders.has(field.getAttribute("data-ref") ?? "");
  };

  const fieldRun = (field: HTMLInputElement | HTMLTextAreaElement, root: Element) => {
    if (
      !(
        field.localName === "textarea" ||
        /^(text|search|email|url|tel|number|)$/.test((field as HTMLInputElement).type)
      ) ||
      typeof field.value !== "string"
    )
      return;
    // An empty field shows its placeholder instead, painted in the ::placeholder colour (Slack's
    // empty date field, where we draw a span).
    const empty = field.value === "";
    const shown = empty ? (field.getAttribute("placeholder") ?? "") : field.value;
    if (shown.trim() === "") return;
    const style = getComputedStyle(field);
    if (style.visibility !== "visible" || style.display === "none") return;
    if (visuallyHidden(field)) return;
    const paint = empty ? getComputedStyle(field, "::placeholder") : style;
    // A typeable select paints its value in a layer over the field and hides the input's own
    // text; that layer's text node is the run.
    const fill = parse(paint.getPropertyValue("-webkit-text-fill-color")) ?? parse(paint.color);
    if (!fill || (fill[3] ?? 1) === 0 || opacityOf(field) === 0) return;
    const text = shown.replace(/\s+/g, " ").trim();
    const rect = fieldValueRect(field, text);
    if (rect.width === 0 || rect.height === 0 || clipped(field, rect)) return;
    runs.push({
      text,
      x: rect.x - origin.x,
      y: rect.y - origin.y,
      width: rect.width,
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight),
      fontStyle: style.fontStyle,
      color: paint.color,
      ...(empty && !placeholderColorKnown(field) && { colorUnknown: true }),
      opacity: Number(style.opacity),
      background: style.backgroundColor,
      motion: motionOf(field, root),
    });
  };

  for (const root of roots) {
    // Runs come in document order: text nodes, and fields' values where the fields sit.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const name = (node as Element).localName;
        if (name === "input" || name === "textarea")
          fieldRun(node as HTMLInputElement | HTMLTextAreaElement, root);
        continue;
      }
      // Text nodes side by side in one element paint as one string (React can split
      // " · colour #1264A3" in two where Slack has one), so they're read together.
      const nodes: Text[] = [node as Text];
      for (let next = node.nextSibling; next?.nodeType === Node.TEXT_NODE; next = next.nextSibling)
        nodes.push(next as Text);
      walker.currentNode = nodes.at(-1) as Text;
      const el = node.parentElement;
      if (!el || nodes.every((n) => !/\S/.test(n.data))) continue;
      const style = getComputedStyle(el);
      if (style.visibility !== "visible" || visuallyHidden(el)) continue;
      const opacity = opacityOf(el);
      if (opacity === 0) continue;

      // Stack the background colours, outermost first, on the white page.
      const layers: string[] = [];
      for (let e: Element | null = el; e; e = e.parentElement)
        layers.push(getComputedStyle(e).backgroundColor);
      let background = [255, 255, 255];
      for (const layer of layers.toReversed()) {
        const c = parse(layer);
        if (!c) continue;
        const a = c[3] ?? 1;
        background = background.map((channel, k) => (c[k] ?? 0) * a + channel * (1 - a));
      }

      for (const line of lineRanges(nodes)) {
        const text = line.toString().replace(/\s+/g, " ").trim();
        const rect = line.getBoundingClientRect();
        if (!text || rect.width === 0 || rect.height === 0 || clipped(el, rect)) continue;
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
  }
  return runs;
}
