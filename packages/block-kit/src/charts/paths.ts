/**
 * Smooth line through points, matching Slack's series curves: each point's tangent runs parallel to
 * its neighbours (flattened at peaks and troughs) and its handles are split in proportion to the
 * adjacent chord lengths, at a tension of 0.5. The end points use themselves as their outer handle.
 */
export function smoothLinePath(points: { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) return "";
  const handles = points.map((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!prev || !next) return { in: p, out: p };
    const d01 = Math.hypot(p.x - prev.x, p.y - prev.y);
    const d12 = Math.hypot(next.x - p.x, next.y - p.y);
    const total = d01 + d12 || 1;
    const fa = (0.5 * d01) / total;
    const fb = (0.5 * d12) / total;
    const extremum = (p.y - prev.y) * (next.y - p.y) <= 0;
    const dx = next.x - prev.x;
    const dy = extremum ? 0 : next.y - prev.y;
    return {
      in: { x: p.x - fa * dx, y: p.y - fa * dy },
      out: { x: p.x + fb * dx, y: p.y + fb * dy },
    };
  });
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const c1 = handles[i - 1]?.out;
    const c2 = handles[i]?.in;
    if (!p || !c1 || !c2) continue;
    d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`;
  }
  return d;
}

/** A bar with the two corners on its outer end (top when positive, bottom when negative) rounded. */
export function roundedBarPath(
  x: number,
  yTop: number,
  width: number,
  yBottom: number,
  radius: number,
  roundTop: boolean,
): string {
  const r = Math.min(radius, width / 2, Math.abs(yBottom - yTop));
  if (roundTop) {
    return `M${x} ${yTop + r}A${r} ${r} 0 0 1 ${x + r} ${yTop}L${x + width - r} ${yTop}A${r} ${r} 0 0 1 ${x + width} ${yTop + r}L${x + width} ${yBottom}L${x} ${yBottom}Z`;
  }
  return `M${x} ${yTop}L${x + width} ${yTop}L${x + width} ${yBottom - r}A${r} ${r} 0 0 1 ${x + width - r} ${yBottom}L${x + r} ${yBottom}A${r} ${r} 0 0 1 ${x} ${yBottom - r}Z`;
}
