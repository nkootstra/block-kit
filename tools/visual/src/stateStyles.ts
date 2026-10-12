/**
 * State styles: what a control's `:hover`, `:active`, `:focus` and `:focus-visible` rules change.
 * snapshot.js records Slack's in a reference's meta (`stateStyles`, keyed by the control's
 * `data-ref`, with its address); compare.ts reads ours with the state forced through the Chrome
 * DevTools Protocol (`CSS.forcePseudoState`) and lists where they differ. Reported, never a
 * baseline finding, like motion.
 */
import type { Page } from "playwright";
import { ourTarget } from "./states";
import { parseTarget } from "./targets";

/** The meta's `stateStyles`: per control, per state, the properties the state changes. */
export type StateStyles = Record<
  string,
  { target: string; states: Record<string, Record<string, string>> }
>;

/**
 * Where the browser matches each state, as snapshot.js emulates it: the control's own pseudo-classes
 * and its ancestors'.
 */
export const FORCED: Record<string, [string[], string[]]> = {
  ":hover": [["hover"], ["hover"]],
  ":active": [
    ["hover", "active"],
    ["hover", "active"],
  ],
  ":focus": [["focus"], ["focus-within"]],
  ":focus-visible": [["focus", "focus-visible"], ["focus-within"]],
};

/** The properties snapshot.js leaves out of a frozen style (its SKIP), left out here too. */
const SKIP =
  /^(--|transition|animation|will-change|cursor|caret|-webkit-tap|pointer-events|user-select|-webkit-user|block-size|inline-size|min-block|min-inline|max-block|max-inline|border-block|border-inline|margin-block|margin-inline|padding-block|padding-inline|inset-block|inset-inline|border-start|border-end|column-rule-color|outline-color|text-emphasis-color|-webkit-text-fill-color|-webkit-text-stroke-color)/;

/** What each state changes on our control at `address`, read with the state forced. */
export async function ourStateStyles(
  page: Page,
  address: string,
  states: string[],
): Promise<Record<string, Record<string, string>>> {
  const target = parseTarget(address);
  if (!target) throw new Error(`${address} isn't a control address`);
  const el = await ourTarget(page, target);
  const depth = await el.evaluate((node) => {
    let n = 0;
    for (let a: Element | null = node as Element; a; a = a.parentElement)
      a.setAttribute("data-sbk-force", String(n++));
    return n;
  });
  const noMotion = await page.addStyleTag({
    content: "*,*::before,*::after{transition:none!important}",
  });
  const cdp = await page.context().newCDPSession(page);
  const read = () =>
    el.evaluate((node, skip) => {
      const cs = getComputedStyle(node as Element);
      const out: Record<string, string> = {};
      const re = new RegExp(skip);
      for (let i = 0; i < cs.length; i++)
        if (!re.test(cs[i]!)) out[cs[i]!] = cs.getPropertyValue(cs[i]!);
      return out;
    }, SKIP.source);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const nodeIds: number[] = [];
    for (let i = 0; i < depth; i++) {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: `[data-sbk-force="${i}"]`,
      });
      nodeIds.push(nodeId);
    }
    const force = (classes: (i: number) => string[]) =>
      Promise.all(
        nodeIds.map((nodeId, i) =>
          cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: classes(i) }),
        ),
      );
    const base = await read();
    const out: Record<string, Record<string, string>> = {};
    for (const state of states) {
      const [own, chain] = FORCED[state] ?? [[], []];
      await force((i) => (i === 0 ? own : chain));
      const now = await read();
      out[state] = Object.fromEntries(Object.entries(now).filter(([p, v]) => base[p] !== v));
      await force(() => []);
    }
    return out;
  } finally {
    await cdp.detach().catch(() => undefined);
    await noMotion.evaluate((node) => (node as Element).remove());
    await page.evaluate(() =>
      document
        .querySelectorAll("[data-sbk-force]")
        .forEach((a) => a.removeAttribute("data-sbk-force")),
    );
  }
}

/**
 * One line per difference: a property Slack's state changes that ours sets to another value, or one
 * ours changes that Slack's leaves alone.
 */
export function diffStateStyles(
  address: string,
  slack: Record<string, Record<string, string>>,
  ours: Record<string, Record<string, string>>,
): string[] {
  const lines: string[] = [];
  for (const state of Object.keys(FORCED)) {
    const s = slack[state] ?? {};
    const o = ours[state] ?? {};
    for (const prop of new Set([...Object.keys(s), ...Object.keys(o)])) {
      if (s[prop] === o[prop]) continue;
      lines.push(
        s[prop] === undefined
          ? `${address}${state} ${prop}: Slack unchanged, ours ${o[prop]}`
          : `${address}${state} ${prop}: Slack ${s[prop]}, ours ${o[prop] ?? "unchanged"}`,
      );
    }
  }
  return lines;
}

/** Every difference between a reference's state styles and ours. */
export async function compareStateStyles(page: Page, styles: StateStyles): Promise<string[]> {
  const lines: string[] = [];
  for (const { target, states } of Object.values(styles)) {
    try {
      lines.push(
        ...diffStateStyles(target, states, await ourStateStyles(page, target, Object.keys(FORCED))),
      );
    } catch (err) {
      lines.push(`${target}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  return lines;
}
