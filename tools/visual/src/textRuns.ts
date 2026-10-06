/**
 * Compares the text runs of a reference snapshot with ours: where each run sits, how wide it is,
 * its font and the colour it paints. The pixel diff scores a whole fixture with a per-pixel
 * threshold, so it can't see a colour a few RGB steps off or a run that moved by a pixel or two.
 */

/** One text node as laid out, relative to the rendered root. Collected by `collectTextRuns`. */
export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  /** The computed `color`, which may be translucent. */
  color: string;
  /** The product of the element's and its ancestors' `opacity`. */
  opacity: number;
  /** The opaque colour the run is painted over. */
  background: string;
  /**
   * How the run's nearest moving element transitions and animates ("transition <property>
   * <duration> <easing> <delay>; animation …"), "" when nothing moves, and absent when a
   * reference was captured before snapshots recorded motion.
   */
  motion?: string;
}

export interface TextRunDifference {
  text: string;
  property: "x" | "y" | "width" | "font-size" | "font-weight" | "font-style" | "color";
  reference: string;
  ours: string;
}

/** A matched run whose element moves differently from Slack's. Reported, never a finding. */
export interface MotionDifference {
  text: string;
  reference: string;
  ours: string;
}

export interface TextRunReport {
  matched: number;
  differences: TextRunDifference[];
  motion: MotionDifference[];
  /** Runs only the reference has. */
  missing: TextRun[];
  /** Runs only we render. */
  extra: TextRun[];
  /**
   * One stable key per difference and unmatched run, `<property>|<text>|<occurrence>`, where
   * occurrence counts earlier runs with the same text (on the reference side, or on ours for an
   * extra run) and the property of an unmatched run is `missing` or `extra`.
   */
  findings: string[];
}

/** Positions and widths within this many pixels count as equal. */
const GEOMETRY_TOLERANCE = 0.5;
/** Painted channels within this many steps count as equal, to absorb rounding in the blend. */
const COLOR_TOLERANCE = 1;

export function compareTextRuns(reference: TextRun[], ours: TextRun[]): TextRunReport {
  const referenceTexts = reference.map((r) => normalizeText(r.text));
  const ourTexts = ours.map((r) => normalizeText(r.text));
  const referenceOccurrences = occurrences(referenceTexts);
  const ourOccurrences = occurrences(ourTexts);
  const pairs = matchInOrder(referenceTexts, ourTexts);

  const differences: TextRunDifference[] = [];
  const findings: string[] = [];
  const motion: MotionDifference[] = [];
  const seenMotion = new Set<string>();
  for (const [i, j] of pairs) {
    const referenceMotion = reference[i]?.motion;
    const ourMotion = ours[j]?.motion ?? "";
    if (referenceMotion !== undefined && referenceMotion !== ourMotion) {
      const difference = {
        text: referenceTexts[i] ?? "",
        reference: referenceMotion || "none",
        ours: ourMotion || "none",
      };
      const key = `${difference.text}|${difference.reference}|${difference.ours}`;
      if (!seenMotion.has(key)) motion.push(difference);
      seenMotion.add(key);
    }
    for (const difference of compareRun(reference[i] as TextRun, ours[j] as TextRun)) {
      differences.push(difference);
      findings.push(`${difference.property}|${referenceTexts[i]}|${referenceOccurrences[i]}`);
    }
  }
  const pairedReference = new Set(pairs.map(([i]) => i));
  const pairedOurs = new Set(pairs.map(([, j]) => j));
  const missing: TextRun[] = [];
  reference.forEach((r, i) => {
    if (pairedReference.has(i)) return;
    missing.push(r);
    findings.push(`missing|${referenceTexts[i]}|${referenceOccurrences[i]}`);
  });
  const extra: TextRun[] = [];
  ours.forEach((r, j) => {
    if (pairedOurs.has(j)) return;
    extra.push(r);
    findings.push(`extra|${ourTexts[j]}|${ourOccurrences[j]}`);
  });
  return { matched: pairs.length, differences, motion, missing, extra, findings };
}

/** A text baseline: each fixture's finding keys, as `fixtures/text-baseline.<platform>.json`. */
export type TextBaseline = Record<string, string[]>;

/**
 * Text runs are laid out deterministically, so unlike the pixel check there's no tolerance: a
 * fixture fails on any finding its baseline doesn't list, even when it also resolved another. A
 * resolved finding is reported as an improvement, and a fixture without an entry is reported, not
 * failed.
 */
export function checkTextBaseline(
  findings: TextBaseline,
  baseline: TextBaseline,
): { failures: string[]; improved: string[]; unrecorded: string[] } {
  const failures: string[] = [];
  const improved: string[] = [];
  const unrecorded: string[] = [];
  for (const [name, keys] of Object.entries(findings)) {
    const before = baseline[name];
    if (before === undefined) {
      unrecorded.push(`${name}: ${keys.length} text findings`);
      continue;
    }
    const known = new Set(before);
    const current = new Set(keys);
    for (const key of keys) {
      if (!known.has(key)) failures.push(`${name}: new text finding ${key}`);
    }
    for (const key of before) {
      if (!current.has(key)) improved.push(`${name}: resolved text finding ${key}`);
    }
  }
  return { failures, improved, unrecorded };
}

/**
 * The next text baseline. A full run drops fixtures it no longer compares. `lowerOnly` records new
 * fixtures and drops resolved findings from known ones but never adds a finding to them, so it
 * can't hide a regression.
 */
export function updateTextBaseline(
  before: TextBaseline,
  findings: TextBaseline,
  { full, lowerOnly }: { full: boolean; lowerOnly: boolean },
): TextBaseline {
  const next: TextBaseline = full && !lowerOnly ? {} : { ...before };
  for (const [name, keys] of Object.entries(findings)) {
    const previous = before[name];
    if (lowerOnly && previous !== undefined) {
      const current = new Set(keys);
      next[name] = previous.filter((key) => current.has(key));
    } else next[name] = keys;
  }
  return Object.fromEntries(Object.entries(next).toSorted(([a], [b]) => a.localeCompare(b)));
}

/** For each text, how many earlier entries have the same text. */
function occurrences(texts: string[]): number[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    return n;
  });
}

function compareRun(reference: TextRun, ours: TextRun): TextRunDifference[] {
  const text = normalizeText(reference.text);
  const out: TextRunDifference[] = [];
  const geometry = (property: "x" | "y" | "width", a: number, b: number) => {
    if (Math.abs(a - b) > GEOMETRY_TOLERANCE) {
      out.push({ text, property, reference: formatNumber(a), ours: formatNumber(b) });
    }
  };
  const exact = (property: TextRunDifference["property"], a: string, b: string) => {
    if (a !== b) out.push({ text, property, reference: a, ours: b });
  };
  geometry("x", reference.x, ours.x);
  geometry("y", reference.y, ours.y);
  geometry("width", reference.width, ours.width);
  exact("font-size", formatNumber(reference.fontSize), formatNumber(ours.fontSize));
  exact("font-weight", String(reference.fontWeight), String(ours.fontWeight));
  exact("font-style", reference.fontStyle, ours.fontStyle);
  const a = paintedColor(reference);
  const b = paintedColor(ours);
  if (a.some((channel, k) => Math.abs(channel - (b[k] as number)) > COLOR_TOLERANCE)) {
    out.push({ text, property: "color", reference: formatRgb(a), ours: formatRgb(b) });
  }
  return out;
}

/** The colour a run's glyphs end up as: its colour, faded by opacity, blended over its background. */
function paintedColor(run: TextRun): [number, number, number] {
  const [r, g, b, alpha] = parseColor(run.color);
  const [br, bg, bb] = parseColor(run.background);
  const a = alpha * run.opacity;
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)].map(Math.round) as [
    number,
    number,
    number,
  ];
}

function parseColor(css: string): [number, number, number, number] {
  const hex = css.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const parts = css
    .match(/^rgba?\(([^)]*)\)$/)?.[1]
    ?.split(/[\s,/]+/)
    .filter(Boolean);
  if (!parts || parts.length < 3) throw new Error(`unsupported colour: ${css}`);
  const [r, g, b, a = "1"] = parts;
  return [Number(r), Number(g), Number(b), Number(a)];
}

/**
 * Pairs equal texts in order with a longest common subsequence, so a run only one side has
 * doesn't shift every later pairing.
 */
function matchInOrder(a: string[], b: string[]): Array<[number, number]> {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lengths[i] as number[];
      const below = lengths[i + 1] as number[];
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if ((lengths[i + 1]?.[j] as number) >= (lengths[i]?.[j + 1] as number)) i++;
    else j++;
  }
  return pairs;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function formatRgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}
