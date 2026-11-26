/**
 * The message the landing page checks against Slack ("Check it against Slack") and the social card
 * shows (tools/video): its payload, that payload as an editor shows it, and what the proof images
 * in `src/assets/proof/` measure. Recount these when the proof images are recaptured.
 */
import fixture from "../../../../fixtures/message/deploy-approval.json";

/** The fixture the proof images were captured from. */
export const BLOCKS = fixture.blocks;

/** The pixels compare scores: the capture's 1024x638 at 2x. All of them match. */
export const PIXELS = 653_312;

/**
 * Where each part of the message ends in the proof images, as a fraction of their height: the
 * message header (app name and time), then each of the five blocks, measured halfway between the
 * text rows around them in `deploy-approval.actual.png` (CSS px out of 319).
 */
export const REVEAL = [26, 63, 123, 225, 264, 319].map((y) => y / 319);

/** A soft edge below a revealed part, shorter than the gap to the next block's first line. */
export const FEATHER = 6 / 319;

/** JSON in an editor's shape: an object or array goes on one line when it fits in `width`. */
function format(value: unknown, indent = 0, used = indent, width = 58): string {
  const inline = JSON.stringify(value, null, 1).replace(/\n\s*/g, " ");
  if (typeof value !== "object" || value === null || used + inline.length <= width) {
    return inline.replace(/([[{]) /g, "$1").replace(/ ([\]}])/g, "$1");
  }
  const pad = " ".repeat(indent + 2);
  const end = " ".repeat(indent);
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => pad + format(v, indent + 2)).join(",\n")}\n${end}]`;
  }
  const entries = Object.entries(value).map(
    ([k, v]) =>
      `${pad}${JSON.stringify(k)}: ${format(v, indent + 2, indent + 2 + k.length + 4, width)}`,
  );
  return `{\n${entries.join(",\n")}\n${end}}`;
}

/** The payload as source: `const blocks = [...]`. */
export const SOURCE = `const blocks = ${format(BLOCKS)};`;

export type Token = { text: string; kind: "key" | "string" | "punct" | "other"; start: number };

/** SOURCE split for highlighting: keys, strings, punctuation and the rest, with their offsets. */
export const TOKENS: Token[] = (() => {
  const tokens: Token[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:])|([^"{}[\],:]+)/g;
  for (const m of SOURCE.matchAll(re)) {
    const start = m.index ?? 0;
    if (m[1] !== undefined) {
      tokens.push({ text: m[1], kind: m[2] ? "key" : "string", start });
      if (m[2]) tokens.push({ text: m[2], kind: "punct", start: start + m[1].length });
    } else if (m[3] !== undefined) tokens.push({ text: m[3], kind: "punct", start });
    else tokens.push({ text: m[0], kind: "other", start });
  }
  return tokens;
})();

/** Where in SOURCE each top-level block closes: a block shows once its source is typed. */
export const BLOCK_ENDS: number[] = (() => {
  const ends: number[] = [];
  let depth = 0;
  for (let i = 0; i < SOURCE.length; i++) {
    const c = SOURCE[i];
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") {
      depth--;
      if (depth === 1 && c === "}") ends.push(i + 1);
    }
  }
  return ends;
})();
