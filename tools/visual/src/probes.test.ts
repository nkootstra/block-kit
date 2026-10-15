import { describe, expect, it } from "bun:test";
import {
  describeStep,
  diffObservations,
  type Observation,
  parseProbe,
  probeSnapshots,
} from "./probes";

const rest: Observation = {
  focus: null,
  layers: [],
  activeOption: null,
  controls: { "field-1": { expanded: "false", value: "Pick" } },
};

describe("probes", () => {
  it("reads steps and refuses anything else", () => {
    expect(
      parseProbe({
        steps: [
          { click: "field-1" },
          { key: "ArrowDown" },
          { click: { role: "option", name: "Bravo" } },
          { type: "hi" },
          { hover: "button-2" },
          { wait: 100 },
          { scroll: "scroller-1", left: "end" },
          { snapshot: "open-hover-bravo" },
        ],
        snapshot: true,
      }),
    ).toMatchObject({ snapshot: true });
    for (const bad of [
      {},
      { steps: [] },
      { steps: [{ click: "nope-1" }] },
      { steps: [{ click: { role: "option" } }] },
      { steps: [{ key: "Enter", wait: 1 }] },
      { steps: [{ wait: -1 }] },
      { steps: [{ key: "Enter" }], extra: true },
      { steps: [{ scroll: "scroller-1" }] },
      { steps: [{ scroll: "scroller-1", left: "far" }] },
      { steps: [{ snapshot: "open" }] },
      { steps: [{ snapshot: "hover-button-1" }] },
      { steps: [{ snapshot: "Bad Name" }] },
    ])
      expect(() => parseProbe(bad)).toThrow();
  });

  it("lists where ours behaves differently, step by step", () => {
    const steps = [{ click: "field-1" }, { key: "ArrowDown" }];
    const slack: Observation[] = [
      rest,
      {
        focus: { target: "field-1", role: "combobox", name: "<member>", where: "preview" },
        layers: [{ kind: "popover", role: "listbox", scrollTop: 0 }],
        activeOption: "Alpha",
        controls: { "field-1": { expanded: "true", value: "Pick" } },
      },
      {
        focus: { target: "field-1", role: "combobox", name: "Pick", where: "preview" },
        layers: [{ kind: "popover", role: "listbox", scrollTop: 36 }],
        activeOption: "Bravo",
        controls: { "field-1": { expanded: "true", value: "Pick" } },
      },
    ];
    const ours: Observation[] = [
      rest,
      {
        focus: { target: "field-1", role: "button", name: "User One", where: "preview" },
        layers: [{ kind: "popover", role: "listbox", scrollTop: 0 }],
        activeOption: "Alpha",
        controls: { "field-1": { expanded: "true", value: "Pick" } },
      },
      {
        focus: { target: "field-1", role: "combobox", name: "Pick", where: "preview" },
        layers: [{ kind: "popover", role: "listbox", scrollTop: 0 }],
        activeOption: "Alpha",
        controls: { "field-1": { expanded: "true", value: "Pick" } },
      },
    ];
    expect(diffObservations(steps, slack, ours)).toEqual([
      'after step 1 (click field-1): focus.role: Slack "combobox", ours "button"',
      "after step 2 (key ArrowDown): layers.0.scrollTop: Slack 36, ours 0",
      'after step 2 (key ArrowDown): activeOption: Slack "Bravo", ours "Alpha"',
    ]);
    expect(diffObservations(steps, slack, slack)).toEqual([]);
  });

  it("describes a step for a report line", () => {
    expect(describeStep({ click: { role: "option", name: "Bravo" } })).toBe('click option "Bravo"');
    expect(describeStep({ type: "hi" })).toBe('type "hi"');
  });

  it("names the references a probe captures, with the steps that lead to each", () => {
    const steps = [
      { click: "field-1" },
      { hover: "option-2" },
      { snapshot: "open-hover-bravo" },
      { click: "option-2" },
    ];
    expect(
      probeSnapshots(
        new Map([
          ["x/y@pick", { steps }],
          ["x/y@end", { steps: [{ click: "button-1" }], snapshot: true }],
        ]),
      ),
    ).toEqual(
      new Map([
        ["x/y@open-hover-bravo", steps.slice(0, 2)],
        ["x/y@end", [{ click: "button-1" }]],
      ]),
    );
  });
});
