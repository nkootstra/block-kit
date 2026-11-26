/**
 * The message the landing page checks against Slack ("Check it against Slack") and the social card
 * shows (tools/video): its payload, that payload as an editor shows it, and what the proof images
 * in `src/assets/proof/` measure. Recount these when the proof images are recaptured.
 */
import fixture from "../../../../fixtures/message/deploy-approval.json";
import { tokenize } from "./highlight";

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

/** SOURCE split for highlighting, with each token's offset. */
export const TOKENS = tokenize(SOURCE);

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
