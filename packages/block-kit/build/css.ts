import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

/** A run of one file's lines, in the order the stylesheet includes it. */
export interface CssSource {
  file: string;
  /** The whole file, for the source map. */
  content: string;
  /** The run's text, and the 0-based line of the file it starts on. */
  text: string;
  line: number;
}

/** Follows `@import "./x.css";` lines depth-first, so the result reads like the files inlined. */
export async function collectCss(file: string): Promise<CssSource[]> {
  const content = await readFile(file, "utf8");
  const sources: CssSource[] = [];
  let text = "";
  let start = 0;
  const lines = content.split(/(?<=\n)/);
  for (const [index, line] of lines.entries()) {
    const match = /^@import "(\.[^"]+)";$/.exec(line.trim());
    if (!match) {
      text += line;
      continue;
    }
    if (text) sources.push({ file, content, text, line: start });
    text = "";
    start = index + 1;
    sources.push(...(await collectCss(join(dirname(file), match[1] as string))));
  }
  if (text) sources.push({ file, content, text, line: start });
  return sources;
}

/** Characters that never need whitespace next to them. */
const TIGHT = new Set(["{", "}", ";", ",", ">"]);
/** Nor after them. A space before `:` stays: `.a :hover` differs from `.a:hover`. */
const TIGHT_AFTER = new Set([...TIGHT, ":"]);

/**
 * Drops comments and whitespace, and nothing else: no value is rewritten, so the result parses to
 * the same rules and declarations as the input. (Minifiers that also shorten values turn
 * `rgba(29, 28, 29, 0.13)` into `#1d1c1d21`, whose alpha is 33/255, not 0.13.) Strings and
 * `url()`s are copied as they are. Returns the CSS and a source map pointing at `sources`.
 */
export function minifyCss(
  sources: CssSource[],
  mapRoot: string,
): {
  code: string;
  map: { version: 3; sources: string[]; sourcesContent: string[]; names: []; mappings: string };
} {
  let out = "";
  // Mappings for the one output line: [generated column, source index, line, column].
  const segments: [number, number, number, number][] = [];
  // Whitespace was skipped since the last character written.
  let pendingSpace = false;
  // Map the next character written: the start of a rule, declaration or block.
  let markNext = true;

  sources.forEach(({ text }, sourceIndex) => {
    let line = 0;
    let column = 0;
    const advance = (n: number) => {
      for (let k = 0; k < n; k++) {
        if (text[i + k] === "\n") {
          line++;
          column = 0;
        } else column++;
      }
      i += n;
    };
    const write = (chunk: string) => {
      if (
        pendingSpace &&
        out &&
        !TIGHT_AFTER.has(out.at(-1) as string) &&
        !TIGHT.has(chunk[0] as string)
      )
        out += " ";
      pendingSpace = false;
      if (markNext) {
        segments.push([out.length, sourceIndex, line, column]);
        markNext = false;
      }
      out += chunk;
    };

    let i = 0;
    while (i < text.length) {
      const ch = text[i] as string;
      if (ch === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        advance((end === -1 ? text.length : end + 2) - i);
        pendingSpace = true;
      } else if (/\s/.test(ch)) {
        advance(1);
        pendingSpace = true;
      } else if (ch === '"' || ch === "'") {
        let end = i + 1;
        while (end < text.length && text[end] !== ch) end += text[end] === "\\" ? 2 : 1;
        write(text.slice(i, end + 1));
        advance(end + 1 - i);
      } else if (
        text.startsWith("url(", i) &&
        !/["']/.test(text.slice(i + 4).trimStart()[0] ?? "")
      ) {
        const end = text.indexOf(")", i);
        write(text.slice(i, end + 1));
        advance(end + 1 - i);
      } else {
        // A `;` right before `}` is redundant.
        if (ch === "}" && out.endsWith(";")) out = out.slice(0, -1);
        write(ch);
        advance(1);
        if (ch === "{" || ch === "}" || ch === ";") markNext = true;
      }
    }
    // A file boundary can separate two tokens.
    pendingSpace = true;
    markNext = true;
  });

  return {
    code: out,
    map: {
      version: 3,
      sources: sources.map((s) => relative(mapRoot, s.file)).filter(unique),
      sourcesContent: sources
        .filter((s, k) => sources.findIndex((t) => t.file === s.file) === k)
        .map((s) => s.content),
      names: [],
      mappings: encode(segments, sources),
    },
  };
}

const unique = <T>(value: T, index: number, all: T[]) => all.indexOf(value) === index;

/** Encodes one generated line of segments as source-map VLQ, with sources deduplicated by file. */
function encode(segments: [number, number, number, number][], sources: CssSource[]): string {
  const files = sources.map((s) => s.file).filter(unique);
  let previous = [0, 0, 0, 0];
  return segments
    .map(([generated, piece, line, column]) => {
      const current = [
        generated,
        files.indexOf((sources[piece] as CssSource).file),
        (sources[piece] as CssSource).line + line,
        column,
      ];
      const delta = current.map((value, k) => value - (previous[k] as number));
      previous = current;
      return delta.map(vlq).join("");
    })
    .join(",");
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let encoded = "";
  do {
    let digit = rest & 31;
    rest >>>= 5;
    if (rest > 0) digit |= 32;
    encoded += BASE64[digit];
  } while (rest > 0);
  return encoded;
}
