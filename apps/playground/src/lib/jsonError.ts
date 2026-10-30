/**
 * Where a JSON text stops being JSON, and why, in words. Browsers word `JSON.parse` errors
 * differently and some give no position at all (Chrome's trailing-comma and end-of-input errors,
 * Safari's), so the playground finds the position itself with this small scanner and only falls
 * back to the browser's message if the scanner finds nothing wrong.
 */
export interface JsonErrorLocation {
  message: string;
  /** 1-based; absent only when neither the scanner nor the browser's message gives a position. */
  line?: number;
  column?: number;
}

class Stop {
  constructor(
    readonly offset: number,
    readonly message: string,
  ) {}
}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

function describe(ch: string): string {
  if (ch === "'") return "JSON strings use double quotes, not single quotes";
  if (ch === "/") return "JSON doesn't allow comments";
  return `Unexpected character ${JSON.stringify(ch)}`;
}

/** Throws a `Stop` at the first place `text` isn't JSON. */
function scan(text: string): void {
  let i = 0;
  const end = text.length;
  const skip = () => {
    while (i < end && WHITESPACE.has(text[i]!)) i++;
  };
  // An error at the end of the text points just after its last character, where the missing
  // bracket or value would go.
  const atEnd = (message: string) => new Stop(text.trimEnd().length, message);

  const string = () => {
    const start = i;
    i++; // the opening quote
    while (i < end) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        return;
      }
      if (ch === "\\") {
        const next = text[i + 1];
        if (next === undefined) break;
        if (next === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
            throw new Stop(i, "A \\u escape needs four hex digits");
          }
          i += 6;
          continue;
        }
        if (!'"\\/bfnrt'.includes(next))
          throw new Stop(i, `Invalid escape "\\${next}" in a string`);
        i += 2;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        throw new Stop(i, "A string can't span lines; write a line break as \\n");
      }
      if (ch < " ") throw new Stop(i, "A string can't hold a control character; escape it");
      i++;
    }
    throw new Stop(start, "This string isn't closed: a closing \" is missing");
  };

  const number = () => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match || match[0] === "-") throw new Stop(i, "Invalid number");
    i += match[0].length;
    const next = text[i];
    if (next !== undefined && /[\d.eE]/.test(next)) throw new Stop(i, "Invalid number");
  };

  const value = (): void => {
    skip();
    if (i >= end) throw atEnd("The JSON ends where a value should be");
    const ch = text[i]!;
    if (ch === "{") return object();
    if (ch === "[") return array();
    if (ch === '"') return string();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return number();
    for (const word of ["true", "false", "null"]) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    throw new Stop(i, describe(ch));
  };

  const object = () => {
    i++;
    skip();
    if (text[i] === "}") {
      i++;
      return;
    }
    for (;;) {
      skip();
      if (i >= end) throw atEnd("The JSON ends inside an object: a closing } is missing");
      if (text[i] !== '"') {
        throw new Stop(
          i,
          text[i] === "'" ? describe("'") : "Expected a property name in double quotes",
        );
      }
      string();
      skip();
      if (i >= end) throw atEnd("The JSON ends inside an object: a closing } is missing");
      if (text[i] !== ":") throw new Stop(i, "Expected a : after the property name");
      i++;
      value();
      skip();
      if (i >= end) throw atEnd("The JSON ends inside an object: a closing } is missing");
      if (text[i] === "}") {
        i++;
        return;
      }
      if (text[i] !== ",") throw new Stop(i, "Expected a , or } after a property value");
      const comma = i;
      i++;
      skip();
      if (text[i] === "}") throw new Stop(comma, "Remove the trailing comma before }");
    }
  };

  const array = () => {
    i++;
    skip();
    if (text[i] === "]") {
      i++;
      return;
    }
    for (;;) {
      value();
      skip();
      if (i >= end) throw atEnd("The JSON ends inside an array: a closing ] is missing");
      if (text[i] === "]") {
        i++;
        return;
      }
      if (text[i] !== ",") throw new Stop(i, "Expected a , or ] after an array item");
      const comma = i;
      i++;
      skip();
      if (text[i] === "]") throw new Stop(comma, "Remove the trailing comma before ]");
    }
  };

  value();
  skip();
  if (i < end) throw new Stop(i, "Unexpected text after the end of the JSON");
}

/** 1-based line and column of a 0-based offset. */
export function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

export function locateJsonError(text: string, parserMessage = ""): JsonErrorLocation {
  try {
    scan(text);
  } catch (err) {
    // Anything else is the scanner's own limit (a stack overflow on very deep nesting).
    if (err instanceof Stop) return { message: err.message, ...lineAndColumn(text, err.offset) };
  }
  // The scanner found nothing (JSON.parse has limits it doesn't model): use the browser's words,
  // with its position when it gives one.
  const message = parserMessage.replace(/\s*\(line \d+ column \d+\)$/, "") || "Invalid JSON";
  const lineColumn = /line (\d+) column (\d+)/.exec(parserMessage);
  if (lineColumn) return { message, line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  const position = /position (\d+)/.exec(parserMessage);
  if (position) return { message, ...lineAndColumn(text, Number(position[1])) };
  return { message };
}
