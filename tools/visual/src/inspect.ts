/**
 * Prints the box model of a reference snapshot (or of our rendering) as an indented tree, to
 * read off the values Slack uses:
 *
 *   bun tools/visual/src/inspect.ts message/approval [--ours] [--depth=12]
 */
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dir, "../../..");
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
if (!name) throw new Error("usage: inspect.ts <fixture> [--ours] [--depth=N]");
const ours = args.includes("--ours");
const depth = Number(args.find((a) => a.startsWith("--depth="))?.slice(8) ?? 40);
const base = args.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:5180";

// Linux hints fonts unless told not to, which skews text widths away from the macOS-captured
// references; see compare.ts.
const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const html = await Bun.file(join(ROOT, "fixtures", `${name}.reference.html`)).text();
const width = html.match(/"width":(\d+)/)?.[1] ?? "512";
if (ours) {
  await page.goto(`${base}/?render=${encodeURIComponent(name)}&width=${width}`);
  await page.waitForSelector("#sbk-render > *");
} else {
  await page.setContent(html);
}

const out = await page.evaluate(
  ({ selector, maxDepth }) => {
    const root = document.querySelector(selector) as HTMLElement;
    const origin = root.getBoundingClientRect();
    const PROPS = [
      "display",
      "position",
      "margin",
      "padding",
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "color",
      "background-color",
      "border",
      "border-radius",
      "gap",
      "grid-template-columns",
      "flex",
      "box-shadow",
      "text-decoration-line",
      "white-space",
      "overflow",
    ];
    const SKIP_VALUES = new Set([
      "0px",
      "none",
      "normal",
      "static",
      "rgba(0, 0, 0, 0)",
      "0 1 auto",
      "visible",
      "0px none rgb(29, 28, 29)",
      "block",
      "inline",
    ]);
    const lines: string[] = [];
    const INHERITED = new Set([
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "line-height",
      "color",
      "white-space",
    ]);
    const walk = (el: Element, d: number, parent: CSSStyleDeclaration | null) => {
      if (d > maxDepth) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const cls = [...el.classList]
        .filter((c) => !/__[A-Za-z0-9_]{5}$/.test(c))
        .slice(0, 3)
        .join(".");
      const props = PROPS.map((p) => [p, cs.getPropertyValue(p)] as const)
        .filter(([p, v]) => {
          if (SKIP_VALUES.has(v) && !INHERITED.has(p)) return false;
          if (INHERITED.has(p) && parent && parent.getPropertyValue(p) === v) return false;
          if (p === "border" && v.startsWith("0px")) return false;
          if (INHERITED.has(p) && !parent && (v === "normal" || v === "400")) return false;
          return true;
        })
        .map(([p, v]) => `${p}:${v}`);
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === 3 && n.textContent?.trim())
        .map((n) => JSON.stringify(n.textContent?.trim().slice(0, 30)))
        .join(" ");
      lines.push(
        `${"  ".repeat(d)}${el.localName}${cls ? `.${cls}` : ""} [${Math.round(r.x - origin.x)},${Math.round(r.y - origin.y)} ${Math.round(r.width)}x${Math.round(r.height)}] ${props.join("; ")} ${text}`,
      );
      for (const child of el.children) walk(child, d + 1, cs);
    };
    walk(root, 0, null);
    return lines.join("\n");
  },
  { selector: ours ? "#sbk-render > *" : "#sbk-reference > *", maxDepth: depth },
);
console.log(out);
await browser.close();
