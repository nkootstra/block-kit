/**
 * Moves the reference's popovers as far as pinning Slack's placeholder bars moved their anchor.
 * normalize.ts pins every unresolved mention's bar to 120px, but Slack placed the tooltip of the
 * mention the capture hovered against the bars at the widths it drew them (recorded in
 * `data-sbk-live-width`): next to a 160px bar, the hovered mention sat further along the line, or
 * on the next one. This lays the bars out at those widths once to find where the anchor was, then
 * shifts each popover layer by how far its centre and top have moved since. Returns the shift, or
 * null when nothing moved. Runs in the page through `page.evaluate`, so it must stay
 * self-contained.
 */
export function followResizedBars(
  anchorRef: string | undefined,
): { dx: number; dy: number } | null {
  const reference = document.getElementById("sbk-reference");
  const anchor = anchorRef ? reference?.querySelector(`[data-ref="${anchorRef}"]`) : null;
  const bars = [...(reference?.querySelectorAll<HTMLElement>("[data-sbk-live-width]") ?? [])];
  const layers = [...document.querySelectorAll<HTMLElement>('[data-sbk-layer="popover"]')];
  if (!anchor || bars.length === 0 || layers.length === 0) return null;

  const pinned = anchor.getBoundingClientRect();
  const widths = bars.map((bar) => bar.style.width);
  for (const bar of bars) bar.style.width = `${bar.dataset.sbkLiveWidth}px`;
  const live = anchor.getBoundingClientRect();
  bars.forEach((bar, i) => {
    bar.style.width = widths[i] ?? "";
  });

  const dx = Math.round(pinned.left + pinned.width / 2 - (live.left + live.width / 2));
  const dy = Math.round(pinned.top - live.top);
  if (dx === 0 && dy === 0) return null;
  for (const layer of layers) {
    layer.style.left = `${Number.parseFloat(layer.style.left || "0") + dx}px`;
    layer.style.top = `${Number.parseFloat(layer.style.top || "0") + dy}px`;
  }
  // snapshot.js pads the page for a layer that sticks out above or left of the message; pad for
  // where the layers are now, or the crop around them starts inside the message.
  const body = getComputedStyle(document.body);
  const top = Math.max(
    Number.parseFloat(body.paddingTop),
    ...layers.map((l) => -Number.parseFloat(l.style.top)),
  );
  const left = Math.max(
    Number.parseFloat(body.paddingLeft),
    ...layers.map((l) => -Number.parseFloat(l.style.left)),
  );
  document.body.style.paddingTop = `${top}px`;
  document.body.style.paddingLeft = `${left}px`;
  return { dx, dy };
}
