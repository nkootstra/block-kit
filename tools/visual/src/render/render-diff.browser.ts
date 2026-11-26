// Needs Chromium (`bunx playwright install chromium`); run with `bun run test:browser`.
import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderDiff } from "./render-diff";

const ROOT = resolve(import.meta.dir, "../../../..");
const LIB = join(ROOT, "packages/block-kit");

describe("renderDiff", () => {
  it("reports no changes when both sides are the same build", async () => {
    const out = await mkdtemp(join(tmpdir(), "render-diff-"));
    const manifest = await renderDiff({ base: LIB, head: LIB, out, only: ["message/"] });
    // Four message fixtures (approval, deploy-approval, mrkdwn, section-accessory), light and dark.
    expect(manifest).toEqual({ rendered: 8, changed: [], failed: [] });
    expect(await readdir(out)).toEqual(["manifest.json"]);
  }, 60_000);
});
