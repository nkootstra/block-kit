import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import { type Component, COMPONENTS } from "./components";
import { caseLabels, checkMapping, discoveryPath, metaHasMotion, registryKeys } from "./generate";
import { FINDINGS } from "./findings";
import { describeTitles, INTERACTION_TESTS } from "./interactionTests";
import {
  batches,
  buildInventory,
  type Cell,
  cellsOf,
  classify,
  fidelityState,
  findComponents,
  fixtureInteraction,
  payloadStates,
  type Sources,
  summarize,
} from "./inventory";

const ROOT = resolve(import.meta.dir, "../../../..");
const byId = (id: string) => COMPONENTS.find((c) => c.id === id)!;

const known = (registry: string, type: string) =>
  COMPONENTS.some(
    (c) => c.impl && "registry" in c.impl && c.impl.registry === registry && c.impl.type === type,
  );

const sources = (overrides: Partial<Sources> = {}): Sources => ({
  payloads: new Map(),
  references: new Map(),
  recordings: new Map(),
  interactionTests: {},
  baseline: new Set(),
  textFindings: new Map(),
  implemented: { blocks: new Set(), elements: new Set(), "rich-text": new Set() },
  files: new Set(),
  ...overrides,
});

const cell = (inventory: { cells: Cell[] }, c: Partial<Cell>) =>
  inventory.cells.find((x) =>
    Object.entries(c).every(([k, v]) => (x as unknown as Record<string, unknown>)[k] === v),
  );

const selects = {
  blocks: [
    {
      type: "actions",
      elements: [
        {
          type: "static_select",
          action_id: "s",
          placeholder: { type: "plain_text", text: "Pick" },
          options: [],
        },
        { type: "datepicker", action_id: "d", initial_date: "2026-01-01" },
      ],
    },
  ],
};

describe("components", () => {
  it("has one entry per id", () => {
    const ids = COMPONENTS.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("names a state for every fact kind it lists", () => {
    for (const c of COMPONENTS) expect(cellsOf(c).length).toBeGreaterThan(0);
  });

  it("has an entry for every type the package renders", async () => {
    const src = join(ROOT, "packages/block-kit/src");
    const blocks = registryKeys(
      await Bun.file(join(src, "blocks/index.ts")).text(),
      "blockComponents",
    );
    const elements = registryKeys(
      await Bun.file(join(src, "elements/index.ts")).text(),
      "elementComponents",
    );
    const rich = caseLabels(await Bun.file(join(src, "blocks/RichText.tsx")).text());
    expect(blocks.size).toBeGreaterThan(20);
    expect([...blocks].filter((t) => !known("blocks", t))).toEqual([]);
    expect([...elements].filter((t) => !known("elements", t))).toEqual([]);
    expect([...rich].filter((t) => !known("rich-text", t) && !t.startsWith("rich_text_"))).toEqual(
      [],
    );
  });

  it("finds a block and an element of the same type apart", () => {
    const payload = {
      blocks: [
        { type: "image", image_url: "x", alt_text: "x" },
        { type: "context", elements: [{ type: "image", image_url: "x", alt_text: "x" }] },
      ],
    };
    const hits = findComponents([byId("image"), byId("image_element")], new Map([["f", payload]]));
    expect(hits.get("image")!.length).toBe(1);
    expect(hits.get("image_element")!.length).toBe(1);
  });
});

describe("interaction test mapping", () => {
  it("matches the interaction test file's groups", async () => {
    const source = await Bun.file(
      join(import.meta.dir, "../interaction/interaction.browser.ts"),
    ).text();
    expect(checkMapping(describeTitles(source))).toEqual([]);
  });

  it("only names known components", () => {
    const ids = new Set(COMPONENTS.map((c) => c.id));
    const named = Object.values(INTERACTION_TESTS).flatMap((g) => g.flatMap((f) => f.components));
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("reports groups on either side that the other doesn't have", () => {
    expect(checkMapping(["checkboxes", "a new group"])).toContain(
      'unmapped interaction test group "a new group"',
    );
    expect(checkMapping([])).toContain('no interaction test group "checkboxes"');
  });
});

describe("horizontal overflow", () => {
  it("gives a wide block unclipped and scrolled-end cells, with behaviour at each width", () => {
    const chart = cellsOf(byId("data_visualization"));
    expect(
      chart.filter((c) => c.state === "scrolled-end" && c.fact === "behaviour").map((c) => c.width),
    ).toEqual(["desktop", "mobile"]);
    expect(chart.some((c) => c.state === "full-content" && c.fact === "styles")).toBe(true);
    const hits = [
      { fixture: "f", node: { type: "data_visualization" }, surface: "message" as const },
    ];
    expect(
      classify(
        byId("data_visualization"),
        { state: "full-content", fact: "styles", theme: "light", width: "mobile" },
        hits,
      ).capability,
    ).toBe("unclipped");
    expect(
      classify(
        byId("data_visualization"),
        { state: "scrolled-end", fact: "behaviour", theme: "any", width: "mobile" },
        hits,
      ).capability,
    ).toBe("scrolled-end");
  });
});

describe("findings", () => {
  it("names only known components", () => {
    const ids = new Set(COMPONENTS.map((c) => c.id));
    expect(FINDINGS.flatMap((f) => f.components).filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("fidelityState", () => {
  it("reads the state a fixture written for the inventory shows", () => {
    expect(fidelityState("extra/fidelity/static-select/many-items", "static_select")).toBe(
      "many-items",
    );
    expect(fidelityState("extra/fidelity/rich-text-user/mixed", "rich_text.user")).toBe("mixed");
    expect(fidelityState("extra/fidelity/static-select/many-items", "button")).toBeUndefined();
    expect(fidelityState("catalog/actions/button", "button")).toBeUndefined();
  });
});

describe("payloadStates", () => {
  it("reads the states a payload sets", () => {
    expect(payloadStates({ type: "static_select", placeholder: {} })).toEqual(["default", "empty"]);
    expect(payloadStates({ type: "datepicker", initial_date: "2026-01-01" })).toEqual([
      "default",
      "initial-value",
    ]);
    expect(
      payloadStates({
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "x".repeat(160) },
      }),
    ).toEqual(["default", "mixed", "long-content"]);
    const options = Array.from({ length: 6 }, (_, i) => ({ value: `${i}` }));
    expect(payloadStates({ type: "checkboxes", options })).toContain("many-items");
  });
});

describe("cells", () => {
  it("previews modal-only components at desktop width only", () => {
    const widths = new Set(
      cellsOf(byId("email_text_input"))
        .filter((c) => c.fact === "styles")
        .map((c) => c.width),
    );
    expect([...widths]).toEqual(["desktop"]);
  });

  it("gives styles a cell per theme and width, and the other facts one", () => {
    const button = cellsOf(byId("button"));
    expect(button.filter((c) => c.fact === "styles" && c.state === "hover").length).toBe(4);
    expect(button.filter((c) => c.fact === "behaviour" && c.state === "hover")).toEqual([
      { component: "button", state: "hover", theme: "any", width: "any", fact: "behaviour" },
    ]);
    expect(button.filter((c) => c.fact === "payload").map((c) => c.state)).toEqual([
      "block_actions",
    ]);
  });

  it("records no behaviour or motion at rest for something that doesn't react", () => {
    expect(cellsOf(byId("divider")).map((c) => c.fact)).toEqual([
      "styles",
      "styles",
      "styles",
      "styles",
    ]);
  });
});

describe("buildInventory", () => {
  const components: Component[] = [byId("static_select"), byId("datepicker"), byId("confirm")];
  const inventory = buildInventory(
    components,
    sources({
      payloads: new Map([["catalog/selects", selects]]),
      references: new Map([
        ["catalog/selects", { motion: true }],
        ["catalog/selects@open+dark", { motion: false }],
      ]),
      recordings: new Map([
        ["catalog/selects@pick", { type: "block_actions", actions: [{ type: "datepicker" }] }],
      ]),
      interactionTests: {
        "theme colours": [{ components: ["static_select"], states: ["hover"], facts: ["styles"] }],
      },
      implemented: {
        blocks: new Set(),
        elements: new Set(["static_select"]),
        "rich-text": new Set(),
      },
    }),
  );

  it("covers the payload states a plain reference shows", () => {
    expect(
      cell(inventory, {
        component: "static_select",
        state: "empty",
        theme: "light",
        width: "desktop",
        fact: "styles",
      })!.covered,
    ).toBe(true);
    expect(
      cell(inventory, {
        component: "datepicker",
        state: "initial-value",
        theme: "light",
        width: "desktop",
        fact: "styles",
      })!.covered,
    ).toBe(true);
    expect(
      cell(inventory, {
        component: "static_select",
        state: "default",
        theme: "dark",
        width: "desktop",
        fact: "styles",
      })!.covered,
    ).toBe(false);
  });

  it("covers @open only for the first control that opens", () => {
    expect(
      cell(inventory, { component: "static_select", state: "open", theme: "dark", fact: "styles" })!
        .covered,
    ).toBe(true);
    expect(
      cell(inventory, { component: "datepicker", state: "open", theme: "dark", fact: "styles" })!
        .covered,
    ).toBe(false);
  });

  it("covers motion from a reference's meta, payloads from recordings and facts from interaction tests", () => {
    expect(
      cell(inventory, { component: "static_select", state: "default", fact: "motion" })!.covered,
    ).toBe(true);
    expect(
      cell(inventory, { component: "datepicker", state: "block_actions", fact: "payload" })!
        .covered,
    ).toBe(true);
    expect(
      cell(inventory, { component: "static_select", state: "block_actions", fact: "payload" })!
        .covered,
    ).toBe(false);
    expect(
      cell(inventory, {
        component: "static_select",
        state: "hover",
        theme: "light",
        width: "desktop",
        fact: "styles",
      })!.evidence,
    ).toEqual(['interaction test "theme colours"']);
  });

  it("credits a @pick reference to the element its payload recording picked, and @menu to the first menu", () => {
    const inv = buildInventory(
      [byId("static_select"), byId("datepicker"), byId("image")],
      sources({
        payloads: new Map<string, unknown>([
          ["x/selects", selects],
          [
            "x/image",
            { blocks: [{ type: "image", image_url: "https://example.com/a.png", alt_text: "A" }] },
          ],
        ]),
        references: new Map([
          ["x/selects@pick+mobile", { motion: false }],
          ["x/image@menu+mobile", { motion: false }],
        ]),
        recordings: new Map([["x/selects@pick", { actions: [{ type: "datepicker" }] }]]),
      }),
    );
    const at = (component: string, state: string) =>
      cell(inv, {
        component,
        state: state as never,
        width: "mobile",
        theme: "light",
        fact: "styles",
      })?.covered;
    expect(at("datepicker", "selected")).toBe(true);
    expect(at("static_select", "selected")).toBe(false);
    expect(at("image", "open")).toBe(true);
  });

  it("reports what isn't implemented and what no fixture shows", () => {
    expect(inventory.gaps.notImplemented).toEqual(["datepicker", "confirm"]);
    expect(inventory.gaps.noFixture).toEqual([]);
  });

  it("counts the references coverage.ts expects and doesn't find", () => {
    // light and @open are there; @mobile, @dark, @mobile+dark and @open+dark aren't.
    expect(inventory.gaps.missingExpectedReferences).toBe(4);
  });

  it("summarizes and batches what's left", () => {
    const s = summarize(inventory);
    // Not-applicable cells (validation at the mobile width here) stay out of the totals.
    expect(s.total.total).toBe(inventory.cells.filter((c) => !c.na).length);
    expect(s.notApplicable).toBe(inventory.cells.filter((c) => c.na).length);
    expect(s.total.covered).toBe(inventory.cells.filter((c) => c.covered).length);
    const list = batches(inventory, components);
    expect(list.reduce((n, b) => n + b.cells, 0)).toBe(
      inventory.cells.filter((c) => !c.covered && !c.na && c.capture!.method !== "c").length,
    );
    // Work on existing fixtures comes before work that waits on new ones.
    const firstNew = list.findIndex((b) => b.newFixtures);
    expect(list.slice(firstNew).every((b) => b.newFixtures)).toBe(true);
  });
});

describe("classify", () => {
  const hits = [
    { fixture: "f", node: { type: "static_select", placeholder: {} }, surface: "message" as const },
  ];
  const select = byId("static_select");
  it("captures interaction states with real input", () => {
    expect(
      classify(select, { state: "hover", fact: "styles", theme: "light", width: "desktop" }, hits)
        .capability,
    ).toBe("real-input");
  });
  it("captures an open control with @open", () => {
    expect(
      classify(select, { state: "open", fact: "styles", theme: "dark", width: "desktop" }, hits),
    ).toMatchObject({ method: "a", how: expect.stringContaining("@open") });
  });
  it("leaves a select dialog's selected state to a probe: @pick is taken after Confirm", () => {
    const dialog = byId("select-dialog");
    expect(fixtureInteraction(dialog, "selected")).toBeUndefined();
    expect(
      classify(dialog, { state: "selected", fact: "styles", theme: "dark", width: "mobile" }, [
        { fixture: "f", node: { type: "multi_users_select" }, surface: "message" as const },
      ]),
    ).toMatchObject({ method: "b", how: expect.stringContaining("before Confirm") });
  });
  it("asks for a fixture when none shows the state", () => {
    expect(
      classify(
        select,
        { state: "many-items", fact: "styles", theme: "light", width: "desktop" },
        hits,
      ).needsFixture,
    ).toBe(true);
  });
  it("says why Block Kit Builder can't show a state", () => {
    expect(
      classify(
        byId("external_select"),
        { state: "loading", fact: "styles", theme: "light", width: "desktop" },
        [],
      ),
    ).toMatchObject({ method: "c" });
  });
});

const page = (motion: unknown) =>
  `<script type="application/json" id="sbk-reference-meta">${JSON.stringify({ motion })}</script>`;

describe("mobile + dark", () => {
  it("captures it like any reference, flagged until the first capture confirms it", () => {
    const hits = [{ fixture: "f", node: { type: "button" }, surface: "message" as const }];
    const button = byId("button");
    expect(
      classify(button, { state: "default", fact: "styles", theme: "dark", width: "mobile" }, hits),
    ).toMatchObject({ method: "a", capability: "reference", verify: true });
    expect(
      classify(button, { state: "default", fact: "styles", theme: "dark", width: "desktop" }, hits)
        .verify,
    ).toBeUndefined();
  });
});

describe("discoveryPath", () => {
  it("reads --discovery with a space or an equals sign", () => {
    expect(discoveryPath(["--discovery", "a.json"])).toBe("a.json");
    expect(discoveryPath(["--discovery=b.json"])).toBe("b.json");
    expect(discoveryPath([])).toBeUndefined();
    expect(() => discoveryPath(["--discovery"])).toThrow("needs the path");
  });
});

describe("reference meta", () => {
  it("finds a transition or an animation", () => {
    expect(metaHasMotion(page({ 1: { "transition-duration": "0.08s" } }))).toBe(true);
    expect(metaHasMotion(page({ 1: { "animation-name": "spin" } }))).toBe(true);
    expect(metaHasMotion(page({ 1: { cursor: "pointer", "transition-duration": "0s" } }))).toBe(
      false,
    );
    expect(metaHasMotion("<html></html>")).toBe(false);
  });
});

describe("buildInventory with the capture kinds beyond plain references", () => {
  const chart = { blocks: [{ type: "data_visualization" }, selects.blocks[0]] };
  const components: Component[] = [
    byId("static_select"),
    byId("datepicker"),
    byId("data_visualization"),
  ];
  const inventory = buildInventory(
    components,
    sources({
      payloads: new Map([["extra/chart", chart]]),
      references: new Map([
        ["extra/chart@hover-field-1+dark", { motion: false }],
        ["extra/chart@mobile+full", { motion: false }],
        ["extra/chart@scrolled-end+mobile", { motion: false }],
        [
          "extra/chart@mobile",
          { motion: false, stateStyles: { "field-2": [":hover", ":active"] }, scrollers: true },
        ],
      ]),
      behaviour: new Map([
        [
          "extra/chart@arrows",
          {
            steps: [{ click: "field-1" }],
            observations: [
              { focus: null, layers: [], activeOption: null, controls: {} },
              {
                focus: null,
                layers: [{ kind: "popover", role: "listbox", scrollTop: 0 }],
                activeOption: null,
                controls: {},
                action: null,
              },
            ],
          },
        ],
      ]),
    }),
  );
  const covered = (c: Partial<Cell>) => cell(inventory, c)?.covered;

  it("covers the held control's state, and no toggled or default cells from it", () => {
    expect(
      covered({
        component: "static_select",
        state: "hover",
        theme: "dark",
        width: "desktop",
        fact: "styles",
      }),
    ).toBe(true);
    expect(
      covered({
        component: "static_select",
        state: "default",
        theme: "dark",
        width: "desktop",
        fact: "styles",
      }),
    ).toBe(false);
  });

  it("covers state styles, full content, the scrolled end and scroll facts", () => {
    expect(
      covered({
        component: "datepicker",
        state: "hover",
        theme: "light",
        width: "mobile",
        fact: "styles",
      }),
    ).toBe(true);
    expect(
      covered({
        component: "data_visualization",
        state: "full-content",
        theme: "light",
        width: "mobile",
        fact: "styles",
      }),
    ).toBe(true);
    expect(
      covered({
        component: "data_visualization",
        state: "scrolled-end",
        theme: "light",
        width: "mobile",
        fact: "styles",
      }),
    ).toBe(true);
    expect(
      covered({
        component: "data_visualization",
        state: "scrolled-end",
        width: "mobile",
        fact: "behaviour",
      }),
    ).toBe(true);
    // The +full reference doesn't count as the chart at rest.
    expect(
      cell(inventory, {
        component: "data_visualization",
        state: "default",
        theme: "light",
        width: "mobile",
        fact: "styles",
      })!.evidence,
    ).not.toContain("reference extra/chart@mobile+full (not in the pixel baseline)");
  });

  it("covers the behaviour a probe recorded", () => {
    expect(covered({ component: "static_select", state: "open", fact: "behaviour" })).toBe(true);
  });
});
