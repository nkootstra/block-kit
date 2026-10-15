import { describe, expect, it } from "bun:test";
import { COMPONENTS } from "./components";
import { buildInventory, type Sources } from "./inventory";
import {
  capturePlan,
  fitsAt,
  fitsAtDesktop,
  forecastFocus,
  forecastProbe,
  openSteps,
  pickedTypes,
  revealSteps,
  SESSION_SIZE,
  VERIFY,
  vary,
  verifyPlan,
} from "./plan";
import { readPayloads } from "../lock";
import { isReferenceName } from "../names";
import { readProbes } from "../probes";

const pick = (...ids: string[]) => COMPONENTS.filter((c) => ids.includes(c.id));
const plain = (text: string) => ({ type: "plain_text", text });

const sources = (payloads: Map<string, unknown>, references: string[] = []): Sources => ({
  payloads,
  references: new Map(references.map((r) => [r, { motion: false }])),
  recordings: new Map(),
  interactionTests: {},
  baseline: new Set(),
  textFindings: new Map(),
  implemented: { blocks: new Set(), elements: new Set(), "rich-text": new Set() },
  files: new Set(),
});

const select = {
  blocks: [
    {
      type: "actions",
      elements: [
        {
          type: "static_select",
          action_id: "s",
          placeholder: plain("Pick"),
          options: [{ text: plain("One"), value: "1" }],
        },
      ],
    },
  ],
};

describe("capturePlan", () => {
  const components = pick("static_select");
  const payloads = new Map<string, unknown>([["catalog/select", select]]);
  const inventory = buildInventory(components, sources(payloads, ["catalog/select"]));
  const plan = capturePlan(inventory, components, payloads, new Set(["catalog/select"]));
  const items = plan.sessions.flatMap((s) => [...s.automatic, ...s.realInput]);
  const names = items.map((i) => i.name);

  it("plans the references today's harness can capture on existing fixtures", () => {
    expect(names).toContain("catalog/select@dark");
    expect(names).toContain("catalog/select@mobile");
    expect(names).toContain("catalog/select@open");
    expect(names).toContain("catalog/select@open+dark");
    expect(names).toContain("catalog/select@mobile+dark");
    expect(items.find((i) => i.name === "catalog/select@open")).toMatchObject({
      path: "fixtures/catalog/select.json",
      manual: false,
      interaction: "open",
    });
  });

  it("asks for a real click where capture.js can't perform the interaction", () => {
    expect(items.find((i) => i.name === "catalog/select@pick")).toMatchObject({
      manual: true,
      needsStateEntry: true,
    });
  });

  it("runs each surface, theme and width once, real input after the automatic items", () => {
    const keys = plan.sessions.map((s) => s.id);
    expect(keys.length).toBe(new Set(keys).size);
    for (const s of plan.sessions) {
      const all = [...s.automatic, ...s.realInput];
      expect(
        all.every((i) => i.surface === s.surface && i.theme === s.theme && i.width === s.width),
      ).toBe(true);
      expect(s.automatic.every((i) => !i.realInput)).toBe(true);
      expect(s.realInput.every((i) => i.realInput)).toBe(true);
    }
    expect(plan.totals.items).toBe(items.length);
    expect(SESSION_SIZE).toBe(25);
    for (const s of plan.sessions) {
      expect(s.chunks.every((c) => c.items.length <= SESSION_SIZE)).toBe(true);
      expect(s.chunks.flatMap((c) => c.items)).toEqual(
        [...s.automatic, ...s.realInput].map((i) => i.name),
      );
      const firstReal = s.chunks.findIndex((c) => c.realInput);
      if (firstReal >= 0) expect(s.chunks.slice(firstReal).every((c) => c.realInput)).toBe(true);
      expect(s.chunks.every((c) => /^.+#[ar]\d{2}$/.test(c.id))).toBe(true);
    }
  });

  it("plans real input on the control a cell is about", () => {
    expect(names).toContain("catalog/select@hover-field-1");
    expect(names).toContain("catalog/select@focus-field-1");
    // Pressed can't be held: a new plain capture's state styles record it.
    expect(items.find((i) => i.name === "catalog/select@dark")!.covers).toContain(
      "static_select pressed styles",
    );
    expect(items.find((i) => i.name === "catalog/select@dark")!.covers).not.toContain(
      "static_select hover styles",
    );
    expect(items.find((i) => i.name === "catalog/select@hover-field-1")).toMatchObject({
      kind: "hover",
      realInput: true,
    });
  });

  it("proposes fixtures for states no fixture shows", () => {
    const many = plan.proposals.find((p) => p.states[0] === "many-items")!;
    expect(many.path).toBe("fixtures/extra/fidelity/static-select/many-items.json");
    const options = (many.payload as typeof select).blocks[0]!.elements[0]!.options;
    expect(options.length).toBe(20);
    expect(many.names).toContain("extra/fidelity/static-select/many-items@dark");
  });

  it("lists the references coverage.ts expects even when no cell needs them", () => {
    const expected = capturePlan(
      buildInventory(components, sources(payloads, [])),
      components,
      payloads,
      new Set(),
    );
    const all = expected.sessions.flatMap((s) =>
      [...s.automatic, ...s.realInput].map((i) => i.name),
    );
    expect(all).toContain("catalog/select");
  });

  it("keeps mobile names off proposals outside a message", () => {
    const modal = {
      type: "modal",
      title: plain("M"),
      blocks: [
        { type: "input", label: plain("L"), element: { type: "email_text_input", action_id: "e" } },
      ],
    };
    const c = pick("email_text_input");
    const p = new Map<string, unknown>([["extra/modal", modal]]);
    const proposals = capturePlan(buildInventory(c, sources(p)), c, p).proposals;
    expect(proposals.flatMap((x) => x.names).some((n) => n.includes("mobile"))).toBe(false);
  });
});

describe("probes", () => {
  const components = pick("static_select", "modal-frame", "plain_text_input");
  it("forecasts what a probe records: behaviour, and the payload it sends", () => {
    const f = forecastProbe(
      "catalog/select@keyboard",
      { steps: [{ click: "field-1" }, { key: "ArrowDown" }, { key: "Enter" }] },
      select,
      components,
    );
    expect(f.behaviour).toContainEqual({ component: "static_select", state: "open" });
    expect(f.behaviour).toContainEqual({ component: "static_select", state: "selected" });
    expect(f.payload).toEqual([{ component: "static_select", event: "block_actions" }]);
    const modal = {
      type: "modal",
      title: plain("M"),
      submit: plain("Go"),
      close: plain("Cancel"),
      blocks: [
        { type: "input", label: plain("L"), element: { type: "plain_text_input", action_id: "t" } },
      ],
    };
    const submit = forecastProbe(
      "m@submit",
      { steps: [{ click: "input-1" }, { type: "Hi" }, { click: "submit-1" }] },
      modal,
      components,
    );
    expect(submit.payload).toContainEqual({ component: "modal-frame", event: "view_submission" });
    expect(submit.payload).toContainEqual({
      component: "plain_text_input",
      event: "view_submission",
    });
  });

  it("plans a probe for the behaviour cells it records", () => {
    const payloads = new Map<string, unknown>([["catalog/select", select]]);
    const c = pick("static_select");
    const plan = capturePlan(
      buildInventory(c, sources(payloads, ["catalog/select"])),
      c,
      payloads,
      new Set(["catalog/select"]),
      new Map([["catalog/select@keyboard", { steps: [{ click: "field-1" }, { key: "Enter" }] }]]),
    );
    const probe = plan.sessions.flatMap((s) => s.realInput).find((i) => i.kind === "probe")!;
    expect(probe).toMatchObject({
      name: "catalog/select@keyboard",
      probe: "fixtures/catalog/select@keyboard.probe.json",
      theme: "light",
      width: "desktop",
    });
    expect(probe.covers).toContain("static_select open behaviour");
    expect(probe.covers).toContain("static_select block_actions payload");
  });
});

describe("proposed probes", () => {
  it("proposes a probe that hovers and clicks a control no probe reaches", () => {
    const payloads = new Map<string, unknown>([["catalog/select", select]]);
    const c = pick("static_select");
    const plan = capturePlan(
      buildInventory(c, sources(payloads, ["catalog/select"])),
      c,
      payloads,
      new Set(["catalog/select"]),
    );
    const poke = plan.probeProposals.find((p) => p.name === "catalog/select@poke-field-1")!;
    expect(poke.probe.steps[0]).toEqual({ hover: "field-1" });
    expect(poke.covers).toContain("static_select hover");
    expect(poke.covers).toContain("static_select open");
  });
});

describe("probes on controls Slack draws only after a click", () => {
  const accessory = {
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "Pick" },
        accessory: {
          type: "multi_static_select",
          action_id: "m",
          placeholder: plain("Select items"),
          options: [{ text: plain("One"), value: "1" }],
        },
      },
    ],
  };
  const plan = {
    blocks: [
      {
        type: "plan",
        title: "Plan",
        tasks: [
          {
            task_id: "1",
            title: "One",
            status: "complete",
            sources: [{ type: "url", url: "https://example.com/a", text: "A" }],
          },
        ],
      },
    ],
  };

  it("opens a section accessory's multi-select through its dialog's field", () => {
    // The dialog opens with its field at rest; the list opens from the field.
    expect(openSteps(accessory, "field-1")).toEqual([
      { click: "field-1" },
      { click: { role: "combobox", name: "Select items" } },
    ]);
    expect(openSteps(select, "field-1")).toEqual([{ click: "field-1" }]);
    // The arrow keys then move the list's highlight, for the accessory that opened it.
    expect(
      forecastFocus([...openSteps(accessory, "field-1"), { key: "ArrowDown" }], accessory),
    ).toEqual({ target: "field-1", visible: true, active: "option-1" });
  });

  it("proposes the dialog's field click in a probe that reaches the accessory's options", () => {
    const c = pick("multi_static_select", "option");
    const payloads = new Map<string, unknown>([["contexts/m/accessory", accessory]]);
    const proposals = capturePlan(
      buildInventory(c, sources(payloads, ["contexts/m/accessory"])),
      c,
      payloads,
      new Set(["contexts/m/accessory"]),
    ).probeProposals;
    const reaching = proposals.filter((p) =>
      p.probe.steps.some((s) => "hover" in s && s.hover === "option-1"),
    );
    expect(reaching.length).toBeGreaterThan(0);
    for (const p of reaching)
      expect(p.probe.steps.slice(0, 2)).toEqual(openSteps(accessory, "field-1"));
  });

  it("expands a plan before it hovers a source, and plans no plain capture of one", () => {
    expect(revealSteps(plan, "source-1")).toEqual([{ click: "pill-1" }]);
    expect(revealSteps(plan, "pill-1")).toEqual([]);
    const c = pick("url_source");
    const payloads = new Map<string, unknown>([["catalog/agents/plan", plan]]);
    const result = capturePlan(
      buildInventory(c, sources(payloads, ["catalog/agents/plan"])),
      c,
      payloads,
      new Set(["catalog/agents/plan"]),
    );
    const names = result.sessions
      .flatMap((s) => [...s.automatic, ...s.realInput])
      .map((i) => i.name);
    expect(names.filter((n) => /@(hover|focus)-source-/.test(n))).toEqual([]);
    const poke = result.probeProposals.find((p) => p.name === "catalog/agents/plan@poke-source-1")!;
    expect(poke.probe.steps[0]).toEqual({ click: "pill-1" });
    const hover = result.probeProposals.find(
      (p) => p.name === "catalog/agents/plan@expanded-hover-source-1",
    )!;
    expect(hover.probe.steps).toEqual([
      { click: "pill-1" },
      { hover: "source-1" },
      { snapshot: "expanded-hover-source-1" },
    ]);
    expect(hover.covers).toContain("url_source hover");
  });

  it("hovers and pokes a carousel's right arrow, the one shown before it scrolls", () => {
    const card = (n: number) => ({ type: "card", title: plain(`Card ${n}`) });
    const carousel = { blocks: [{ type: "carousel", elements: [1, 2, 3, 4].map(card) }] };
    const c = pick("carousel");
    const payloads = new Map<string, unknown>([["catalog/carousel", carousel]]);
    const result = capturePlan(
      buildInventory(c, sources(payloads, ["catalog/carousel"])),
      c,
      payloads,
      new Set(["catalog/carousel"]),
    );
    const names = [
      ...result.sessions.flatMap((s) => [...s.automatic, ...s.realInput]).map((i) => i.name),
      ...result.probeProposals.map((p) => p.name),
    ].filter((n) => n.includes("arrow-"));
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.includes("arrow-2"))).toBe(true);
  });

  it("plans no real input on a contact card, which the Builder doesn't reliably draw", () => {
    const callout = {
      blocks: [
        {
          type: "callout",
          child_blocks: [{ type: "contact_card", contact_user_id: "U0123456789" }],
        },
      ],
    };
    const c = pick("contact_card");
    const payloads = new Map<string, unknown>([["catalog/callout", callout]]);
    const result = capturePlan(
      buildInventory(c, sources(payloads, ["catalog/callout"])),
      c,
      payloads,
      new Set(["catalog/callout"]),
    );
    const names = [
      ...result.sessions.flatMap((s) => [...s.automatic, ...s.realInput]).map((i) => i.name),
      ...result.probeProposals.map((p) => p.name),
    ];
    expect(names.filter((n) => n.includes("contact-"))).toEqual([]);
    expect(result.unplanned.some((u) => u.reason.includes("contact card"))).toBe(true);
  });

  it("plans no scroll to the end at a width where nothing overflows", () => {
    const table = {
      blocks: [{ type: "table", rows: [[{ type: "raw_text", text: "a" }]] }],
    };
    const c = pick("table");
    const payloads = new Map<string, unknown>([["catalog/t", table]]);
    const names = (fitsMobile: Set<string>) =>
      capturePlan(
        buildInventory(c, sources(payloads, ["catalog/t"])),
        c,
        payloads,
        new Set(["catalog/t"]),
        new Map(),
        new Set(),
        new Set(),
        fitsMobile,
      )
        .sessions.flatMap((s) => [...s.automatic, ...s.realInput])
        .map((i) => i.name);
    expect(names(new Set())).toContain("catalog/t@scrolled-end+mobile");
    expect(names(new Set(["catalog/t"])).filter((n) => n.includes("scrolled-end+mobile"))).toEqual(
      [],
    );
  });

  it("forecasts a confirm dialog's Tab order: Close, then Cancel, then the confirm button", () => {
    const payload = {
      blocks: [
        {
          type: "actions",
          elements: [{ type: "button", text: plain("Go"), confirm: {} }],
        },
      ],
    };
    const tabs = (n: number) =>
      forecastFocus(
        [{ click: "button-1" }, ...Array.from({ length: n }, () => ({ key: "Tab" }))],
        payload,
      );
    expect(tabs(1)).toBeUndefined();
    expect(tabs(2)).toEqual({ target: "deny-1", visible: true });
    expect(tabs(3)).toEqual({ target: "confirm-1", visible: true });
  });

  it("plans @pick only for the element the fixture's recording picked", () => {
    expect(
      pickedTypes(
        new Map([
          ["x/selects@pick", { actions: [{ type: "datepicker" }] }],
          ["x/selects@pick-15th", { actions: [{ type: "static_select" }] }],
        ]),
      ),
    ).toEqual(new Map([["x/selects", "datepicker"]]));
    const two = {
      blocks: [
        {
          type: "actions",
          elements: [
            { type: "static_select", action_id: "s", placeholder: plain("P"), options: [] },
            { type: "datepicker", action_id: "d" },
          ],
        },
      ],
    };
    const c = pick("static_select", "datepicker");
    const payloads = new Map<string, unknown>([["x/selects", two]]);
    const items = capturePlan(
      buildInventory(c, sources(payloads, ["x/selects"])),
      c,
      payloads,
      new Set(["x/selects"]),
      new Map(),
      new Set(),
      new Set(),
      new Set(),
      new Map([["x/selects", "datepicker"]]),
    ).sessions.flatMap((s) => [...s.automatic, ...s.realInput]);
    const picks = items.filter((i) => i.name.startsWith("x/selects@pick"));
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.flatMap((i) => i.covers).every((c) => c.startsWith("datepicker "))).toBe(true);
  });

  it("plans no keyboard focus on the message header, which the Builder draws as plain text", () => {
    const c = pick("message-header");
    const payloads = new Map<string, unknown>([["catalog/select", select]]);
    const result = capturePlan(
      buildInventory(c, sources(payloads, ["catalog/select"])),
      c,
      payloads,
      new Set(["catalog/select"]),
    );
    const names = result.sessions
      .flatMap((s) => [...s.automatic, ...s.realInput])
      .map((i) => i.name);
    expect(names).toContain("catalog/select@hover-sender-1");
    expect(names.filter((n) => /@focus-(sender|time)-/.test(n))).toEqual([]);
  });

  it("proposes no sideways scroll of a block that fits the desktop preview", () => {
    const refs = new Map([
      ["catalog/table/simple-table@full", { measured: true, overflows: false }],
      ["catalog/table/wide@full", { measured: true, overflows: true }],
      ["catalog/table/wide", { measured: true, overflows: false }],
      ["catalog/table/mobile-only@mobile", { measured: true, overflows: true }],
      // A +full capture with nothing to widen, and no scroll container at all.
      ["catalog/rich-text/kitchen-sink@mobile+full", { measured: true, overflows: false }],
      ["catalog/table/plain", {}],
    ]);
    expect(fitsAtDesktop(refs)).toEqual(new Set(["catalog/table/simple-table"]));
    expect(fitsAt(refs, "mobile")).toEqual(new Set(["catalog/rich-text/kitchen-sink"]));
    const table = {
      blocks: [
        {
          type: "table",
          rows: [[{ type: "raw_text", text: "a" }], [{ type: "raw_text", text: "b" }]],
        },
      ],
    };
    const c = pick("table");
    const payloads = new Map<string, unknown>([["catalog/table/simple-table", table]]);
    const propose = (fits: Set<string>) =>
      capturePlan(
        buildInventory(c, sources(payloads, ["catalog/table/simple-table"])),
        c,
        payloads,
        new Set(["catalog/table/simple-table"]),
        new Map(),
        new Set(),
        fits,
      ).probeProposals.map((p) => p.name);
    expect(propose(new Set())).toContain("catalog/table/simple-table@scroll-scroller-1");
    expect(propose(new Set(["catalog/table/simple-table"]))).not.toContain(
      "catalog/table/simple-table@scroll-scroller-1",
    );
  });
});

describe("verification session", () => {
  it("names one capture of each kind on fixtures and probes that exist, real input last", async () => {
    const items = verifyPlan(await readPayloads(), await readProbes());
    expect(items.length).toBe(VERIFY.length);
    expect(items.every((i) => isReferenceName(i.name))).toBe(true);
    const firstReal = items.findIndex((i) => i.realInput);
    expect(items.slice(firstReal).every((i) => i.realInput)).toBe(true);
    expect(new Set(items.map((i) => i.kind))).toEqual(
      new Set(["rest", "open", "scrolled-end", "full", "hover", "focus", "probe", "submit-errors"]),
    );
  });
});

describe("vary", () => {
  it("writes the state's variation of a node", () => {
    expect(vary({ type: "datepicker", action_id: "d" }, "initial-value")).toMatchObject({
      initial_date: "2026-01-15",
    });
    expect(
      vary({ type: "static_select", initial_option: {}, placeholder: plain("P") }, "empty"),
    ).toEqual({
      type: "static_select",
      placeholder: plain("P"),
    });
    expect(vary({ type: "overflow", options: [{}] }, "many-items")!.options).toHaveLength(5);
    expect(vary({ type: "divider" }, "mixed")).toBeUndefined();
  });

  it("keeps initial options among the options it replaces", () => {
    const radio = {
      type: "radio_buttons",
      initial_option: { text: plain("Medium"), value: "medium" },
      options: [{ text: plain("Medium"), value: "medium" }],
    };
    const many = vary(radio, "many-items")!;
    expect((many.options as { value: string }[]).map((o) => o.value)).toContain(
      (many.initial_option as { value: string }).value,
    );
  });

  it("never changes the node it was given", () => {
    const node = { type: "button", text: plain("Go") };
    vary(node, "long-content");
    expect(node.text.text).toBe("Go");
  });
});
