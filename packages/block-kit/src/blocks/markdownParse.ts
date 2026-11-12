import type { Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/*
 * micromark takes time quadratic in how deep emphasis or lists nest: a run of 6,000 `*` around a
 * word, or a line of 6,000 `- `, takes seconds to parse, which stalls the page or the server
 * render. Nothing renders that deep, so before parsing the middle of each long `*` or `_` run, and
 * the list markers past the 32nd on a line, are set aside behind a placeholder, and put back as
 * literal text in the parsed tree. Code, URLs and thematic breaks come out exactly as written.
 *
 * The placeholder is EN QUAD, the index, EN QUAD. EN QUAD is Unicode whitespace, so the runs on
 * either side of a placeholder can't open or close emphasis, as a fill-in blank of underscores
 * between spaces can't. An EN QUAD already in the text is set aside the same way, so every one the
 * parser sees belongs to a placeholder.
 */

const MARK = "\u2000";
const PLACEHOLDER = /\u2000(\d+)\u2000/g;

/** A `*` or `_` run longer than this keeps its first and last `RUN_EDGE` characters. */
const MAX_RUN = 64;
const RUN_EDGE = 32;
const LONG_RUN = new RegExp(`([*_])\\1{${MAX_RUN},}`, "g");

/** How many list or block quote markers a line keeps before the rest are text. */
const MAX_MARKERS = 32;
const MARKER = /[ \t]*(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)|>[ \t]?)/y;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*\r?$/;

/**
 * Slack's limit for the text of a markdown block ("The cumulative limit for all `markdown` blocks
 * in a single payload is 12,000 characters"). Slack refuses a longer one; here it shows as plain
 * text, unparsed, so its length costs only its length.
 */
export const MAX_MARKDOWN_LENGTH = 12_000;

/*
 * micromark also takes time quadratic in the emphasis delimiters and brackets of a paragraph that
 * never close: 12,000 characters of `*a_` take a second to parse, and `_a* ` half of one. From the
 * delimiter past the `MAX_DELIMITERS`th in a paragraph, the rest of each of its lines is set aside
 * as text, behind one placeholder a line: a placeholder per delimiter would make the text longer,
 * and an unclosed `[` costs time in how much text follows it. Matched delimiters count too, so the
 * cap is far above what a paragraph uses: 500 is 250 bold words.
 */
const MAX_DELIMITERS = 500;
const DELIMITER = /([*_~])\1*|[[\]]/g;
/**
 * A line that always ends the paragraph before it: a blank line, a heading, or a list item that
 * may interrupt a paragraph (a bullet with text, or an ordered item numbered 1). Anything else may
 * continue the paragraph above it, so its delimiters count toward the same cap.
 */
const PARAGRAPH_START = /^(?:[ \t]*\r?$| {0,3}#{1,6}(?:[ \t]|\r?$)|[ \t]*(?:[-*+]|1[.)])[ \t]+\S)/;

/** The string fields of mdast nodes that carry text from the source. */
const TEXT_FIELDS = ["value", "url", "title", "alt", "lang", "meta", "label"] as const;

/** Parses a `markdown` block's text as GitHub-flavored markdown. */
export function parseMarkdown(text: string): Root {
  if (text.length > MAX_MARKDOWN_LENGTH) {
    return {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
    };
  }
  const pieces: string[] = [];
  const setAside = (piece: string) => `${MARK}${pieces.push(piece) - 1}${MARK}`;
  // A set-aside piece holds the text as written, so placeholders inside it are put back first.
  const asWritten = (piece: string) =>
    piece.replace(PLACEHOLDER, (_, index: string) => pieces[Number(index)] ?? "");

  const lines: string[] = [];
  let delimiters = 0;
  /** The piece that takes the rest of the paragraph once it has `MAX_DELIMITERS` delimiters. */
  let rest = -1;
  for (const line of text.replaceAll(MARK, setAside).split("\n")) {
    if (PARAGRAPH_START.test(line)) {
      delimiters = 0;
      rest = -1;
    }
    if (rest !== -1) {
      pieces[rest] += `\n${asWritten(line)}`;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      lines.push(line);
      continue;
    }
    const capped = capRuns(capMarkers(line, setAside), setAside);
    let cut = -1;
    for (const match of capped.matchAll(DELIMITER)) {
      if (++delimiters > MAX_DELIMITERS) {
        cut = match.index;
        break;
      }
    }
    if (cut === -1) {
      lines.push(capped);
      continue;
    }
    lines.push(capped.slice(0, cut) + setAside(asWritten(capped.slice(cut))));
    rest = pieces.length - 1;
  }
  const source = lines.join("\n");

  const tree = fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  if (pieces.length > 0) restore(tree, pieces);
  return tree;
}

/** Sets aside the list and block quote markers past the `MAX_MARKERS`th at the start of `line`. */
function capMarkers(line: string, setAside: (piece: string) => string): string {
  let count = 0;
  let cut = -1;
  let end = 0;
  MARKER.lastIndex = 0;
  while (end < line.length && MARKER.exec(line)) {
    end = MARKER.lastIndex;
    count += 1;
    if (count === MAX_MARKERS) cut = end;
  }
  if (cut === -1 || end === cut) return line;
  return line.slice(0, cut) + setAside(line.slice(cut, end)) + line.slice(end);
}

/** Sets aside the middle of every `*` or `_` run longer than `MAX_RUN` in `line`. */
function capRuns(line: string, setAside: (piece: string) => string): string {
  return line.replace(
    LONG_RUN,
    (run) =>
      run.slice(0, RUN_EDGE) + setAside(run.slice(RUN_EDGE, -RUN_EDGE)) + run.slice(-RUN_EDGE),
  );
}

/** Puts every set-aside piece back into the text fields of `tree`. */
function restore(tree: Root, pieces: string[]): void {
  const stack: Nodes[] = [tree];
  for (let node = stack.pop(); node; node = stack.pop()) {
    const fields = node as unknown as Record<string, unknown>;
    for (const field of TEXT_FIELDS) {
      const value = fields[field];
      if (typeof value === "string" && value.includes(MARK)) {
        fields[field] = value.replace(
          PLACEHOLDER,
          (_, index: string) => pieces[Number(index)] ?? "",
        );
      }
    }
    if ("children" in node) stack.push(...node.children);
  }
}
