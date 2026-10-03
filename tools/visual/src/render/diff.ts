import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const CHANGED: [number, number, number] = [255, 0, 0];
/** How strongly unchanged pixels show through in the changes image (pixelmatch's `alpha`). */
const FADE = 0.2;

/**
 * Compares two renders of the same fixture. Rows are aligned first, the way a text diff aligns
 * lines, so content that only moved (a taller block above it) doesn't count as changed: only
 * inserted, removed and edited rows do. Edited rows are compared with pixelmatch; every pixel of an
 * inserted or removed row counts. Renders of different widths are padded with white.
 *
 * `image` is the after render, faded, with what changed in red: as wide as the wider render and as
 * tall as the after render. A removed row shows as a red line where it used to be.
 */
export function diffPngs(before: Buffer, after: Buffer): { image: Buffer; changedPixels: number } {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  const width = Math.max(a.width, b.width);
  const rowsA = rows(a, width);
  const rowsB = rows(b, width);
  const out = new PNG({ width, height: b.height });
  let changedPixels = 0;

  for (const hunk of alignRows(rowsA.map(hash), rowsB.map(hash))) {
    if (hunk.type === "equal") {
      for (const j of hunk.after) fade(rowsB[j] as Buffer, out, j);
      continue;
    }
    const paired = Math.min(hunk.before.length, hunk.after.length);
    if (paired > 0) {
      const edited = compareRows(
        hunk.before.slice(0, paired).map((i) => rowsA[i] as Buffer),
        hunk.after.slice(0, paired).map((j) => rowsB[j] as Buffer),
        width,
      );
      changedPixels += edited.changedPixels;
      hunk.after.slice(0, paired).forEach((j, k) => {
        edited.rows[k]?.copy(out.data, j * width * 4);
      });
    }
    for (const j of hunk.after.slice(paired)) {
      changedPixels += width;
      fill(out, j, CHANGED);
    }
    const removed = hunk.before.length - paired;
    if (removed > 0) {
      changedPixels += removed * width;
      // Removed rows have no place in the after render: mark where they were.
      const at = hunk.after.length ? (hunk.after.at(-1) as number) : hunk.at;
      if (at < b.height) fill(out, at, CHANGED);
    }
  }
  return { image: PNG.sync.write(out), changedPixels };
}

/** Each row of `png` as RGBA bytes, padded with white to `width`. */
function rows(png: PNG, width: number): Buffer[] {
  return Array.from({ length: png.height }, (_, y) => {
    const row = Buffer.alloc(width * 4, 255);
    png.data.copy(row, 0, y * png.width * 4, (y + 1) * png.width * 4);
    return row;
  });
}

function hash(row: Buffer): string {
  return Bun.hash(row).toString(36);
}

type Hunk =
  | { type: "equal"; before: number[]; after: number[] }
  /** `at`: the after row the change sits before, for a hunk that only removes rows. */
  | { type: "change"; before: number[]; after: number[]; at: number };

/**
 * Aligns two sequences of row hashes by their longest common subsequence, after trimming the rows
 * they share at the top and bottom (most of a render), so the quadratic part only sees the edit.
 */
function alignRows(a: string[], b: string[]): Hunk[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  // lcs[i * (m + 1) + j]: length of the LCS of a[start + i..endA) and b[start + j..endB).
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] =
        a[start + i] === b[start + j]
          ? (lcs[(i + 1) * (m + 1) + j + 1] as number) + 1
          : Math.max(lcs[(i + 1) * (m + 1) + j] as number, lcs[i * (m + 1) + j + 1] as number);
    }
  }

  const hunks: Hunk[] = [];
  /** `at`: the after row the step sits at, which a hunk that only removes rows is drawn on. */
  const push = (type: "equal" | "change", i: number | null, j: number | null, at = 0) => {
    let last = hunks.at(-1);
    if (last?.type !== type) {
      last =
        type === "equal" ? { type, before: [], after: [] } : { type, before: [], after: [], at };
      hunks.push(last);
    }
    if (i !== null) last.before.push(i);
    if (j !== null) last.after.push(j);
  };

  for (let k = 0; k < start; k++) push("equal", k, k);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      push("equal", start + i++, start + j++);
    } else if (
      j < m &&
      (i === n || (lcs[i * (m + 1) + j + 1] as number) >= (lcs[(i + 1) * (m + 1) + j] as number))
    ) {
      push("change", null, start + j, start + j++);
    } else {
      push("change", start + i++, null, start + j);
    }
  }
  for (let k = 0; k < a.length - endA; k++) push("equal", endA + k, endB + k);
  return hunks;
}

/** Compares edited rows pairwise with pixelmatch, as one image so its anti-aliasing check works. */
function compareRows(before: Buffer[], after: Buffer[], width: number) {
  const height = before.length;
  const output = Buffer.alloc(width * height * 4);
  const changedPixels = pixelmatch(
    Buffer.concat(before),
    Buffer.concat(after),
    output,
    width,
    height,
    { diffColor: CHANGED, alpha: FADE },
  );
  const outputRows = Array.from({ length: height }, (_, k) =>
    output.subarray(k * width * 4, (k + 1) * width * 4),
  );
  return { changedPixels, rows: outputRows };
}

/** Draws a row the way pixelmatch draws unchanged pixels: grayscale, blended towards white. */
function fade(row: Buffer, out: PNG, y: number) {
  for (let x = 0; x < out.width; x++) {
    const i = x * 4;
    const luma =
      0.29889531 * (row[i] as number) +
      0.58662247 * (row[i + 1] as number) +
      0.11448223 * (row[i + 2] as number);
    const gray = 255 + (luma - 255) * FADE * ((row[i + 3] as number) / 255);
    out.data.set([gray, gray, gray, 255], (y * out.width + x) * 4);
  }
}

function fill(out: PNG, y: number, [r, g, b]: [number, number, number]) {
  for (let x = 0; x < out.width; x++) out.data.set([r, g, b, 255], (y * out.width + x) * 4);
}
