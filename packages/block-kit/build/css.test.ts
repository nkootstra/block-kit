import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectCss, minifyCss } from "./css.ts";

const minify = (text: string) =>
  minifyCss([{ file: "a.css", content: text, text, line: 0 }], ".").code;

describe("minifyCss", () => {
  it("drops comments and whitespace", () => {
    expect(minify("/* note */\n.a {\n  color: red;\n  margin: 0 auto;\n}\n")).toBe(
      ".a{color:red;margin:0 auto}",
    );
  });

  it("rewrites no value", () => {
    expect(minify(":root { --x: rgba(29, 28, 29, 0.13); width: calc(100% - 4px); }")).toBe(
      ":root{--x:rgba(29,28,29,0.13);width:calc(100% - 4px)}",
    );
  });

  it("keeps the space before a pseudo-class, which makes it a descendant", () => {
    expect(minify(".a :where(.b) , .c > .d:hover { x: y }")).toBe(".a :where(.b),.c>.d:hover{x:y}");
  });

  it("copies strings and url() as they are", () => {
    const svg = `url("data:image/svg+xml,<svg viewBox=%220 0 20 20%22>  /* not a comment */</svg>")`;
    expect(minify(`.a { mask: ${svg}; content: "a  ;  b"; }`)).toBe(
      `.a{mask:${svg};content:"a  ;  b"}`,
    );
    expect(minify(".a { background: url( x y.png ) }")).toBe(".a{background:url( x y.png )}");
  });

  it("keeps at-rule preludes intact", () => {
    expect(
      minify("@media (prefers-color-scheme: dark) and (min-width: 600px) {\n  .a { b: c }\n}"),
    ).toBe("@media (prefers-color-scheme:dark) and (min-width:600px){.a{b:c}}");
  });
});

describe("collectCss", () => {
  it("inlines @imports in order and maps lines back to each file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sbk-css-"));
    await writeFile(
      join(dir, "entry.css"),
      '/* entry */\n@import "./a.css";\n@import "./b.css";\n.e { x: y }\n',
    );
    await writeFile(join(dir, "a.css"), ".a { x: y }\n");
    await writeFile(join(dir, "b.css"), "\n\n.b { x: y }\n");
    const sources = await collectCss(join(dir, "entry.css"));
    expect(sources.map((s) => [s.file.slice(dir.length + 1), s.line])).toEqual([
      ["entry.css", 0],
      ["a.css", 0],
      ["b.css", 0],
      ["entry.css", 3],
    ]);
    const { code, map } = minifyCss(sources, dir);
    expect(code).toBe(".a{x:y}.b{x:y}.e{x:y}");
    expect(map.sources).toEqual(["entry.css", "a.css", "b.css"]);
    // .a at a.css 0:0, .b at b.css 2:0, .e at entry.css 3:0 (sources: entry 0, a 1, b 2).
    expect(decode(map.mappings)).toContainEqual([0, 1, 0, 0]);
    expect(decode(map.mappings)).toContainEqual([7, 2, 2, 0]);
    expect(decode(map.mappings)).toContainEqual([14, 0, 3, 0]);
  });
});

/** Decodes one line of VLQ mappings into absolute [column, source, line, column] segments. */
function decode(mappings: string): number[][] {
  const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const state = [0, 0, 0, 0];
  return mappings.split(",").map((segment) => {
    const values: number[] = [];
    let value = 0;
    let shift = 0;
    for (const char of segment) {
      const digit = BASE64.indexOf(char);
      value += (digit & 31) << shift;
      if (digit & 32) shift += 5;
      else {
        values.push(value & 1 ? -(value >> 1) : value >> 1);
        value = 0;
        shift = 0;
      }
    }
    return values.map((delta, k) => (state[k] = (state[k] as number) + delta));
  });
}
