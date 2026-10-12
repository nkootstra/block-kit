import { describe, expect, it } from "bun:test";
import { COMPONENTS } from "./components";
import { buildInventory, type Sources } from "./inventory";
import {
  discover,
  type DiscoveryRule,
  FAMILIES,
  familyOf,
  parseDiscovery,
  selectorParts,
  statesOf,
} from "./stylesheet";

const ids = new Set(COMPONENTS.map((c) => c.id));
const rule = (selector: string, extra: Partial<DiscoveryRule> = {}): DiscoveryRule => ({
  selector,
  pseudo: [],
  properties: ["background-color"],
  direct: true,
  ...extra,
});

describe("parseDiscovery", () => {
  it("reads selectors, pseudo-classes and property names", () => {
    expect(
      parseDiscovery([
        {
          selector: ".c-button:hover",
          pseudo: [":hover"],
          properties: ["color", "--sk_button-radius"],
          direct: true,
        },
        {
          selector: ".c-icon--spin:before",
          pseudo: [":before"],
          properties: ["animation"],
          keyframes: ["c-icon--spin"],
        },
      ]),
    ).toEqual([
      {
        selector: ".c-button:hover",
        pseudo: [":hover"],
        properties: ["color", "--sk_button-radius"],
        direct: true,
        media: undefined,
        keyframes: [],
      },
      {
        selector: ".c-icon--spin:before",
        pseudo: [":before"],
        properties: ["animation"],
        direct: false,
        media: undefined,
        keyframes: ["c-icon--spin"],
      },
    ]);
  });

  it("refuses anything that could carry Slack's CSS values", () => {
    expect(() => parseDiscovery({})).toThrow("JSON array");
    expect(() =>
      parseDiscovery([{ selector: ".c-button", pseudo: [], properties: ["color: red"] }]),
    ).toThrow("isn't a property name");
    expect(() =>
      parseDiscovery([
        { selector: ".c-button", pseudo: [], properties: [], declarations: [["color", "red"]] },
      ]),
    ).toThrow('has "declarations"');
    expect(() => parseDiscovery([{ pseudo: [], properties: [] }])).toThrow("no selector");
  });
});

describe("selectors", () => {
  it("names a class's family by its BEM block, or its CSS module", () => {
    expect(familyOf("c-select_input__content--focused")).toBe("c-select_input");
    expect(familyOf("p-rich_text_section")).toBe("p-rich_text_section");
    expect(familyOf("multiSelectInput__uy4YB")).toBe("module:multiSelectInput");
    expect(familyOf("ql-editor")).toBeUndefined();
  });

  it("splits a selector list only at its top-level commas", () => {
    expect(selectorParts(".a:is(.b,.c) .d, .e")).toEqual([".a:is(.b,.c) .d", ".e"]);
  });

  it("reads states from pseudo-classes, modifiers and attributes", () => {
    expect(statesOf(".c-select_input:hover .c-icon").states).toEqual(["hover"]);
    expect(statesOf(".c-menu_item__button--highlighted").states).toEqual(["hover"]);
    expect(statesOf(".c-select_button[disabled]").states).toEqual(["disabled"]);
    expect(statesOf(".c-input_checkbox[data-checked=true]").states).toEqual(["selected"]);
    expect(statesOf(".c-button:not(:hover)").states).toEqual([]);
    expect(statesOf(".c-button--primary")).toEqual({ states: [], variants: ["primary"] });
    // A size isn't a variant, and the client theme isn't the component's.
    expect(statesOf(".sk-client-theme--dark .c-button--small").variants).toEqual([]);
  });
});

describe("discover", () => {
  const found = discover(
    [
      rule(".c-button:hover"),
      rule(".c-button-loading__spinner", {
        properties: ["animation"],
        keyframes: ["c-icon--spin"],
      }),
      rule(".c-select_options_list__option--disabled"),
      rule(".c-select_options_list__group_header"),
      rule(".p-grid_field:hover .c-input_text"),
      rule(".c-mrkdwn__broadcast--mention:hover"),
      rule(".c-unknown_widget:focus"),
      rule(".c-icon--spin:before"),
    ],
    ids,
  );

  it("files each state under the component its class draws", () => {
    expect([...found.byComponent.get("button")!.keys()]).toEqual(["hover", "loading"]);
    expect(found.byComponent.get("button")!.get("loading")!.facts).toEqual(new Set(["motion"]));
    expect(found.byComponent.get("static_select")!.has("disabled")).toBe(true);
    expect([...found.byComponent.get("option_group")!.keys()]).toEqual(["open"]);
    expect([...found.byComponent.get("rich_text.broadcast")!.keys()]).toEqual(["hover"]);
  });

  it("drops a Block Kit class styled inside another part of the client", () => {
    expect(found.byComponent.get("plain_text_input")).toBeUndefined();
  });

  it("reports families nothing maps, and why the out-of-scope ones are", () => {
    const byName = new Map(found.families.map((f) => [f.family, f]));
    expect(byName.get("c-unknown_widget")).toMatchObject({
      status: "unmapped",
      reason: expect.stringContaining("review"),
      states: ["focus-visible"],
    });
    expect(byName.get("p-grid_field")).toMatchObject({
      status: "out-of-scope",
      reason: "Slack Lists",
    });
    expect(byName.get("c-icon")!.status).toBe("out-of-scope");
    expect(found.rules).toEqual({ total: 8, mapped: 5, outOfScope: 2, unmapped: 1 });
  });

  it("maps only to components the inventory knows", () => {
    const known = new Set(COMPONENTS.map((c) => c.id));
    expect(
      Object.values(FAMILIES)
        .flat()
        .filter((id) => !known.has(id)),
    ).toEqual([]);
  });
});

describe("the inventory with a stylesheet", () => {
  const base: Sources = {
    payloads: new Map(),
    references: new Map(),
    recordings: new Map(),
    interactionTests: {},
    baseline: new Set(),
    textFindings: new Map(),
    implemented: { blocks: new Set(), elements: new Set(), "rich-text": new Set() },
    files: new Set(),
  };
  const button = COMPONENTS.filter((c) => c.id === "button");

  it("adds the states only the stylesheets show as builder-css cells", () => {
    const inventory = buildInventory(button, {
      ...base,
      stylesheet: [rule(".c-button--disabled"), rule(".c-button:hover")],
    });
    expect(inventory.stylesheet!.added).toEqual([{ component: "button", states: ["disabled"] }]);
    const disabled = inventory.cells.filter((c) => c.state === "disabled");
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled.every((c) => c.origin === "builder-css")).toBe(true);
    const hover = inventory.cells.find((c) => c.state === "hover" && c.fact === "styles")!;
    expect(hover).toMatchObject({ origin: "curated", rules: 1 });
    expect(hover.capture!.how).toContain("1 Builder stylesheet rules style it");
  });

  it("is the curated inventory without one", () => {
    const inventory = buildInventory(button, base);
    expect(inventory.stylesheet).toBeUndefined();
    expect(inventory.cells.every((c) => c.origin === "curated" && c.rules === undefined)).toBe(
      true,
    );
  });
});
