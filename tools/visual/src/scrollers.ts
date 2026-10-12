/**
 * Horizontal scroll containers: a chart's card, a table or a carousel wider than the message. A
 * frozen reference can't scroll, so snapshot.js records each container in the preview (`scrollers`
 * in the meta: its `data-ref`, scroll width, client width and scroll offset), and `+full`
 * references are captured with the content unclipped (names.ts). This file does the same on our
 * rendering for compare.ts.
 */
import type { Page } from "playwright";

export interface Scroller {
  ref?: string;
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

/** Content within a pixel of the box doesn't count as overflowing. */
const overflows = (s: Scroller) => s.scrollWidth > s.clientWidth + 1;

/** Our horizontal scroll containers under `#sbk-render`, in document order. */
export function ourScrollers(page: Page): Promise<Scroller[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("#sbk-render *")]
      .filter((el) => /^(auto|scroll)$/.test(getComputedStyle(el).overflowX))
      .map((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollLeft: Math.round(el.scrollLeft),
      })),
  );
}

/**
 * Where our scroll containers differ from Slack's: the containers that overflow are paired in
 * document order and compared by content width and visible width (±1px). Reported, never a
 * baseline finding.
 */
export function diffScrollers(slack: Scroller[], ours: Scroller[]): string[] {
  const a = slack.filter(overflows);
  const b = ours.filter(overflows);
  const lines: string[] = [];
  if (a.length !== b.length)
    lines.push(`Slack has ${a.length} overflowing scroll containers, ours ${b.length}`);
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    for (const key of ["scrollWidth", "clientWidth"] as const)
      if (Math.abs(a[i]![key] - b[i]![key]) > 1)
        lines.push(`scroller ${i + 1} ${key}: Slack ${a[i]![key]}px, ours ${b[i]![key]}px`);
  return lines;
}

/** Scrolls the reference's frozen containers back to where Slack's were. */
export function restoreScroll(page: Page, scrollers: Scroller[]): Promise<void> {
  return page.evaluate((list) => {
    for (const { ref, scrollLeft } of list)
      if (ref && scrollLeft > 0) {
        const el = document.querySelector(`#sbk-reference [data-ref="${ref}"]`);
        if (el) el.scrollLeft = scrollLeft;
      }
  }, scrollers);
}

/**
 * `+full` on ours: the page already renders at the reference's widened width; any container that
 * still overflows is expanded to its content, as capture.js expands Slack's.
 */
export function expandOurs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>("#sbk-render *")].filter(
      (el) =>
        /^(auto|scroll)$/.test(getComputedStyle(el).overflowX) &&
        el.scrollWidth > el.clientWidth + 1,
    );
    const outer = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    for (const el of outer) {
      el.style.setProperty("width", `${el.scrollWidth}px`, "important");
      el.style.setProperty("max-width", "none", "important");
      el.style.setProperty("overflow-x", "visible", "important");
      el.style.setProperty("flex", "none", "important");
    }
    return outer.length;
  });
}

/** `@scrolled-end` on ours: the first container that overflows, scrolled fully right. */
export function scrollOursToEnd(page: Page): Promise<void> {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("#sbk-render *")].find(
      (e) =>
        /^(auto|scroll)$/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1,
    );
    if (!el) throw new Error("nothing in our rendering scrolls sideways");
    el.scrollTo({ left: el.scrollWidth, behavior: "instant" });
  });
}
