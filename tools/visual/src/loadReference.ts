import type { Page } from "playwright";

/**
 * Loads a reference's HTML into the page. setContent() replaces the document but keeps its
 * JavaScript running, so in a page the previous fixture rendered in, our render's timers and
 * re-renders carried on and could put its open list back into the reference, where the comparison
 * read it as the reference's own. Leaving for about:blank first ends that render.
 */
export async function loadReference(page: Page, html: string): Promise<void> {
  await page.goto("about:blank");
  await page.setContent(html, { waitUntil: "load" });
}
