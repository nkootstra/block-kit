import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { allowed, CONTEXTS, ELEMENTS, fixtureFor } from "./contexts";
import { FIXTURES } from "./lock";

describe("context fixtures", () => {
  it("follows where Slack allows each element", () => {
    // From Slack's Block Kit reference: input-only elements live in input blocks, and the
    // datetime picker isn't allowed in App Home.
    expect(allowed("plain_text_input", "actions")).toBe(false);
    expect(allowed("plain_text_input", "modal-input")).toBe(true);
    expect(allowed("datetimepicker", "home")).toBe(false);
    expect(allowed("overflow", "modal-input")).toBe(false);
    expect(allowed("static_select", "home")).toBe(true);
  });

  it("leaves out the multi-selects Block Kit Builder refuses in an actions block", () => {
    // The Builder drops a multi-select in a message's or App Home's actions block and keeps
    // showing the previous payload, so a capture there records some other fixture.
    for (const element of ["multi_static_select", "multi_users_select"]) {
      expect(allowed(element, "actions")).toBe(false);
      expect(allowed(element, "home")).toBe(false);
      expect(allowed(element, "accessory")).toBe(true);
      expect(allowed(element, "modal-input")).toBe(true);
    }
  });

  it("only puts an element in an accessory where Block Kit Builder takes one", () => {
    // The Builder's error for a datetime picker accessory lists what a section accessory may be.
    const BUILDER_ACCESSORIES = new Set([
      "button",
      "workflow_button",
      "overflow",
      "static_select",
      "users_select",
      "conversations_select",
      "channels_select",
      "external_select",
      "multi_static_select",
      "multi_users_select",
      "multi_conversations_select",
      "multi_channels_select",
      "multi_external_select",
      "image",
      "radio_buttons",
      "checkboxes",
      "datepicker",
      "timepicker",
    ]);
    for (const [name, { element }] of Object.entries(ELEMENTS))
      expect([name, allowed(name, "accessory")]).toEqual([
        name,
        BUILDER_ACCESSORIES.has(element.type as string),
      ]);
  });

  it("puts an element in the block its context names", () => {
    expect(fixtureFor("static_select", "accessory")).toMatchObject({
      blocks: [{ type: "section", accessory: { type: "static_select" } }],
    });
    expect(fixtureFor("datepicker", "modal-input")).toMatchObject({
      type: "modal",
      blocks: [{ type: "input", element: { type: "datepicker" } }],
    });
    expect(fixtureFor("button", "home")).toMatchObject({
      type: "home",
      blocks: [{ type: "actions", elements: [{ type: "button" }] }],
    });
  });

  it("has a fixture on disk for every allowed pairing, and nothing else", async () => {
    const expected = new Map<string, unknown>();
    for (const element of Object.keys(ELEMENTS))
      for (const context of CONTEXTS)
        if (allowed(element, context))
          expected.set(`contexts/${element}/${context}`, fixtureFor(element, context));
    const onDisk = new Map<string, unknown>();
    for await (const path of new Glob("contexts/**/*.json").scan(FIXTURES))
      onDisk.set(path.replace(/\.json$/, ""), await Bun.file(join(FIXTURES, path)).json());
    expect([...onDisk.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [name, payload] of expected)
      expect({ name, payload: onDisk.get(name) }).toEqual({ name, payload });
  });
});

describe("writeContexts", () => {
  it("rewrites the fixtures but leaves the captured references next to them alone", async () => {
    const { mkdtemp, mkdir, writeFile, exists } = await import("node:fs/promises").then(
      async (fs) => ({ ...fs, exists: (p: string) => Bun.file(p).exists() }),
    );
    const { tmpdir } = await import("node:os");
    const { writeContexts } = await import("./contexts");
    const dir = await mkdtemp(join(tmpdir(), "contexts-"));
    await mkdir(join(dir, "button"), { recursive: true });
    await writeFile(join(dir, "button", "actions.reference.html"), "<p>captured</p>");
    await mkdir(join(dir, "gone"), { recursive: true });
    await writeFile(join(dir, "gone", "actions.json"), "{}");
    await writeContexts(dir);
    expect(await exists(join(dir, "button", "actions.reference.html"))).toBe(true);
    expect(await exists(join(dir, "button", "actions.json"))).toBe(true);
    expect(await exists(join(dir, "gone", "actions.json"))).toBe(false);
  });
});
