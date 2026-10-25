import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compareCapture, describeChanges, formatMarkdown } from "./drift";
import { FIXTURES, hashPayload, type Lock, LOCK, readReferences, sha256 } from "./lock";
import { normalize } from "./normalize";
import { parseCaptureFile } from "./recordings";

const payload = { blocks: [{ type: "section", text: { type: "mrkdwn", text: "Hello" } }] };
const other = { blocks: [{ type: "section", text: { type: "mrkdwn", text: "Goodbye" } }] };

/** A snapshot as capture.js records it: the meta script, then the preview. */
function snapshot(p: unknown, style = "padding:4px", capturedAt = "2026-10-01T12:00:00.000Z") {
  const meta = JSON.stringify({ capturedAt, payload: p, height: 40 });
  return `<!doctype html>\n<html><head><script type="application/json" id="sbk-reference-meta">${meta}</script></head><body><div class="p-block" style="${style}"><span>Hello</span></div></body></html>`;
}

const committed = normalize(snapshot(payload));
const lock: Lock = {
  "demo/section": {
    payload: hashPayload(payload),
    reference: sha256(committed),
    captured: "2026-10-01",
  },
};
const references = new Map([["demo/section", committed]]);
const payloads = new Map<string, unknown>([["demo/section", payload]]);

const run = (captured: Record<string, string>, prefixes: string[] = []) =>
  compareCapture({
    capture: parseCaptureFile({ references: captured, actions: {}, behaviour: {} }),
    lock,
    references,
    payloads,
    redactions: {},
    prefixes,
  });

describe("compareCapture", () => {
  it("counts a capture that renders the same as unchanged, whenever it was taken", () => {
    const report = run({
      "demo/section": snapshot(payload, "padding:4px", "2026-10-21T08:00:00.000Z"),
    });
    expect(report.unchanged).toEqual(["demo/section"]);
    expect(report.drifted).toEqual([]);
    expect(report.payloadChanged).toEqual([]);
  });

  it("reports a changed style as drift, naming the property", () => {
    const report = run({ "demo/section": snapshot(payload, "padding:6px") });
    expect(report.unchanged).toEqual([]);
    expect(report.drifted).toEqual([
      {
        name: "demo/section",
        captured: "2026-10-01",
        changes: ["1 of 6 nodes differ", "<div.p-block> style padding: 4px -> 6px"],
      },
    ]);
  });

  it("reports a captured state without a committed reference as new", () => {
    const report = run({ "demo/section@mobile": snapshot(payload) });
    expect(report.new).toEqual(["demo/section@mobile"]);
    expect(report.drifted).toEqual([]);
  });

  it("skips names import.ts would skip", () => {
    const report = run({ "demo/missing": snapshot(payload), "Not A Name": snapshot(payload) });
    expect(report.skipped.map((s) => s.name)).toEqual(["demo/missing", "Not A Name"]);
  });

  it("reports a capture of another payload separately from Builder drift", () => {
    const report = run({ "demo/section": snapshot(other, "padding:6px") });
    expect(report.drifted).toEqual([]);
    expect(report.payloadChanged).toEqual([{ name: "demo/section", captured: "2026-10-01" }]);
  });

  it("matches a fixture saved as a bare block array to its wrapped capture", () => {
    const blocks = payload.blocks;
    const report = compareCapture({
      capture: parseCaptureFile({ "demo/section": snapshot(payload) }),
      lock: { "demo/section": { ...lock["demo/section"]!, payload: hashPayload(blocks) } },
      references,
      payloads: new Map([["demo/section", blocks]]),
      redactions: {},
    });
    expect(report.unchanged).toEqual(["demo/section"]);
  });

  it("lists committed references under the prefixes that the capture left out", () => {
    expect(run({}, ["demo/"]).notCaptured).toEqual(["demo/section"]);
    expect(run({}, ["other/"]).notCaptured).toEqual([]);
  });
});

describe("describeChanges", () => {
  it("names changed text and meta fields", () => {
    const a =
      '<script type="application/json" id="sbk-reference-meta">{"height":40}</script><b>Hi</b>';
    const b =
      '<script type="application/json" id="sbk-reference-meta">{"height":42}</script><b>Hey</b>';
    expect(describeChanges(a, b)).toEqual([
      "1 of 2 nodes differ",
      'text "Hi" -> "Hey"',
      "meta: height",
    ]);
  });
});

describe("formatMarkdown", () => {
  it("lists what drifted as a checklist for an issue", () => {
    const report = run({ "demo/section": snapshot(payload, "padding:6px") });
    expect(formatMarkdown(report)).toContain(
      "- [ ] `demo/section` (captured 2026-10-01): 1 of 6 nodes differ; <div.p-block> style padding: 4px -> 6px",
    );
  });
});

describe("drift.ts", () => {
  // Starts the CLI, which reads every reference and fixture: a quarter of a second alone, but past
  // the 5s default while Turbo runs every workspace's tests at once (CI on #328).
  it("compares a capture file with the committed references without writing to fixtures/", async () => {
    const [name, html] = [...(await readReferences())][0]!;
    const dir = await mkdtemp(join(tmpdir(), "drift-"));
    try {
      const file = join(dir, "capture.json");
      await Bun.write(file, JSON.stringify({ references: { [name]: html } }));
      const report = join(dir, "report.md");
      const before = await listing();
      const lockBefore = await stat(LOCK);
      const proc = Bun.spawn(
        ["bun", resolve(import.meta.dir, "drift.ts"), file, `--report=${report}`],
        { stdout: "pipe", stderr: "pipe" },
      );
      const out = await new Response(proc.stdout).text();
      expect(await proc.exited).toBe(0);
      expect(out).toContain("1 unchanged");
      expect(await Bun.file(report).text()).toContain("1 unchanged");
      expect(await listing()).toEqual(before);
      expect((await stat(LOCK)).mtimeMs).toBe(lockBefore.mtimeMs);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

async function listing() {
  return (await readdir(FIXTURES, { recursive: true })).toSorted();
}
