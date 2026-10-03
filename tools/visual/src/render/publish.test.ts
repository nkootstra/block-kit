import { describe, expect, it } from "bun:test";
import { commentBody, MAX_SHOWN, readArtifact } from "./publish";
import type { Manifest } from "./render-diff";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

const divider: Manifest = {
  rendered: 254,
  changed: [{ fixture: "catalog/structure/divider", theme: "dark", changedPixels: 2312 }],
  failed: [],
};
const dividerFiles = [
  { path: "manifest.json", bytes: json(divider) },
  { path: "catalog/structure/divider.dark.before.png", bytes: PNG_BYTES },
  { path: "catalog/structure/divider.dark.after.png", bytes: PNG_BYTES },
  { path: "catalog/structure/divider.dark.diff.png", bytes: PNG_BYTES },
];

describe("readArtifact", () => {
  it("accepts the renders a pull request's run uploaded", () => {
    expect(readArtifact(dividerFiles)).toEqual({ ok: true, manifest: divider });
  });

  it("rejects a file that isn't a PNG, whatever its name says", () => {
    const files = [...dividerFiles];
    files[1] = { path: files[1]!.path, bytes: new TextEncoder().encode("GIF89a...") };
    expect(readArtifact(files)).toEqual({
      ok: false,
      problems: ["catalog/structure/divider.dark.before.png is not a PNG"],
    });
  });

  it("rejects files a render can't have produced", () => {
    const files = [...dividerFiles, { path: "../index.html", bytes: PNG_BYTES }];
    expect(readArtifact(files)).toEqual({
      ok: false,
      problems: ["../index.html is not a render"],
    });
  });

  it("rejects a render larger than 5 MB", () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    const files = [...dividerFiles];
    files[3] = { path: files[3]!.path, bytes: big };
    expect(readArtifact(files)).toEqual({
      ok: false,
      problems: ["catalog/structure/divider.dark.diff.png is larger than 5 MB"],
    });
  });

  it("rejects a manifest whose fixture names could inject Markdown into the comment", () => {
    const manifest = {
      ...divider,
      changed: [{ fixture: "[x](https://evil.example)", theme: "dark", changedPixels: 1 }],
    };
    const result = readArtifact([{ path: "manifest.json", bytes: json(manifest) }]);
    expect(result).toEqual({ ok: false, problems: ["manifest.json is malformed"] });
  });

  it("rejects a manifest that lists a change without its renders", () => {
    const result = readArtifact(dividerFiles.slice(0, 3));
    expect(result).toEqual({
      ok: false,
      problems: ["catalog/structure/divider.dark.diff.png is missing"],
    });
  });
});

describe("commentBody", () => {
  const options = {
    imageBase: "https://cdn.block-kit.dev/pr-7/abc123",
    sha: "abc123",
    runUrl: "https://github.com/o/r/actions/runs/1",
  };

  it("shows before, after and the changes of every changed render", () => {
    const body = commentBody(divider, options);
    expect(body).toStartWith("<!-- visual-diff -->\n");
    expect(body).toContain(
      "| `catalog/structure/divider` dark<br>2,312 px " +
        "| ![before](https://cdn.block-kit.dev/pr-7/abc123/catalog/structure/divider.dark.before.png) " +
        "| ![after](https://cdn.block-kit.dev/pr-7/abc123/catalog/structure/divider.dark.after.png) " +
        "| ![changes](https://cdn.block-kit.dev/pr-7/abc123/catalog/structure/divider.dark.diff.png) |",
    );
  });

  it("writes no comment when nothing changed", () => {
    expect(commentBody({ rendered: 254, changed: [], failed: [] }, options)).toBeUndefined();
  });

  it(`shows at most ${MAX_SHOWN} renders and links the run for the rest`, () => {
    const changed = Array.from({ length: MAX_SHOWN + 2 }, (_, i) => ({
      fixture: `catalog/f${i}`,
      theme: "light" as const,
      changedPixels: 1,
    }));
    const body = commentBody({ rendered: 254, changed, failed: [] }, options);
    expect(body).toContain(`catalog/f${MAX_SHOWN - 1}\``);
    expect(body).not.toContain(`catalog/f${MAX_SHOWN}\``);
    expect(body).toContain("…and 2 more in [the run](https://github.com/o/r/actions/runs/1).");
  });

  it("lists renders that failed", () => {
    const body = commentBody(
      {
        rendered: 252,
        changed: [],
        failed: [{ fixture: "message/approval", theme: "dark", error: "boom" }],
      },
      options,
    );
    expect(body).toContain("- `message/approval` dark: boom");
    expect(body).not.toContain("![");
  });
});
