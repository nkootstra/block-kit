import { describe, expect, it } from "vitest";
import { lineAndColumn, locateJsonError } from "./jsonError";

describe("locateJsonError", () => {
  it.each([
    ['{"blocks":[{"type":"divider"},]}', "Remove the trailing comma before ]", 1, 30],
    ['{"a":1,}', "Remove the trailing comma before }", 1, 7],
    ['{"blocks":[', "The JSON ends where a value should be", 1, 12],
    ['{"blocks":[]', "The JSON ends inside an object: a closing } is missing", 1, 13],
    ["[1, 2", "The JSON ends inside an array: a closing ] is missing", 1, 6],
    ['{"text": "open', "This string isn't closed: a closing \" is missing", 1, 10],
    ["{'a': 1}", "JSON strings use double quotes, not single quotes", 1, 2],
    ["{a: 1}", "Expected a property name in double quotes", 1, 2],
    ['{"a" 1}', "Expected a : after the property name", 1, 6],
    ['{"a": 1 "b": 2}', "Expected a , or } after a property value", 1, 9],
    ["[1 2]", "Expected a , or ] after an array item", 1, 4],
    ["// note\n[]", "JSON doesn't allow comments", 1, 1],
    ["[01]", "Invalid number", 1, 3],
    ["[undefined]", 'Unexpected character "u"', 1, 2],
    ['["a\\x"]', 'Invalid escape "\\x" in a string', 1, 4],
    ['["a\nb"]', "A string can't span lines; write a line break as \\n", 1, 4],
    ["[] []", "Unexpected text after the end of the JSON", 1, 4],
  ])("finds where %j stops being JSON", (text, message, line, column) => {
    expect(() => JSON.parse(text)).toThrow(SyntaxError);
    expect(locateJsonError(text)).toEqual({ message, line, column });
  });

  it("counts lines and columns from 1", () => {
    const text = '{\n  "blocks": [\n    {"type": "divider"},\n  ]\n}';
    expect(locateJsonError(text)).toMatchObject({ line: 3, column: 24 });
  });

  it("points just after the last character when the JSON ends early", () => {
    expect(locateJsonError('{\n  "blocks": [\n\n')).toMatchObject({ line: 2, column: 14 });
  });

  it("falls back to the browser's position when the scanner finds nothing", () => {
    expect(locateJsonError("[]", "Unexpected token in JSON at position 1")).toEqual({
      message: "Unexpected token in JSON at position 1",
      line: 1,
      column: 2,
    });
    expect(locateJsonError("[]", "Bad (line 4 column 2)")).toEqual({
      message: "Bad",
      line: 4,
      column: 2,
    });
    expect(locateJsonError("[]", "Bad")).toEqual({ message: "Bad" });
  });
});

describe("lineAndColumn", () => {
  it("maps an offset to its line and column", () => {
    expect(lineAndColumn("ab\ncd", 0)).toEqual({ line: 1, column: 1 });
    expect(lineAndColumn("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });
});
