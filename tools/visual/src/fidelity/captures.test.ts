import { describe, expect, it } from "bun:test";
import { behaviourEvidence, controlComponents, referenceEvidence, referenceMeta } from "./captures";
import type { Component } from "./components";

const component = (id: string, states: Component["states"], type = id): Component => ({
  id,
  name: id,
  kind: "element",
  source: "slack-docs",
  surfaces: ["message", "modal"],
  tier: 1,
  states,
  match: (o) => o.type === type,
});
const COMPONENTS = [
  component("button", ["default", "hover", "focus-visible", "pressed"]),
  component("checkboxes", ["default", "hover", "focus-visible", "selected"]),
  component("static_select", ["default", "hover", "focus-visible", "open", "selected"]),
  component("datetimepicker", ["default", "hover", "focus-visible"]),
  component("data_visualization", ["default", "full-content", "scrolled-end"]),
  component("input", ["default", "validation-error"]),
  component("modal-frame", ["default", "hover", "focus-visible"], "modal"),
];

const message = {
  blocks: [
    {
      type: "actions",
      elements: [
        { type: "checkboxes", options: [{}, {}] },
        { type: "button" },
        { type: "datetimepicker" },
        { type: "static_select" },
      ],
    },
    { type: "data_visualization" },
  ],
};
const modal = {
  type: "modal",
  submit: { type: "plain_text", text: "Go" },
  blocks: [{ type: "input", element: { type: "plain_text_input" } }],
};

describe("capture evidence", () => {
  it("counts controls per kind as targets.ts addresses them", () => {
    expect(controlComponents(message)).toEqual({
      checkbox: ["checkboxes", "checkboxes"],
      button: ["button"],
      field: ["datetimepicker", "datetimepicker", "static_select"],
      menu: ["data_visualization"],
    });
    expect(controlComponents(modal)).toMatchObject({
      submit: ["modal-frame"],
      input: ["plain_text_input"],
    });
  });

  it("covers the hovered or focused control's styles at the reference's theme and width", () => {
    expect(referenceEvidence("x/m@hover-field-3+dark", message, COMPONENTS)).toEqual([
      {
        component: "static_select",
        state: "hover",
        theme: "dark",
        width: "desktop",
        fact: "styles",
        what: "reference x/m@hover-field-3+dark",
      },
    ]);
    expect(referenceEvidence("x/m@focus-checkbox-2+mobile", message, COMPONENTS)[0]).toMatchObject({
      component: "checkboxes",
      state: "focus-visible",
      width: "mobile",
    });
    expect(referenceEvidence("x/m@hover-button-9", message, COMPONENTS)).toEqual([]);
  });

  it("covers state styles, full content, the scrolled end and scroll facts", () => {
    const evidence = referenceEvidence("x/m@mobile", message, COMPONENTS, {
      stateStyles: { "button-1": [":hover", ":active", ":focus"] },
      scrollers: true,
    });
    expect(evidence.map((e) => `${e.component} ${e.state} ${e.fact} ${e.width}`)).toEqual([
      "button hover styles mobile",
      "button pressed styles mobile",
      "data_visualization scrolled-end behaviour mobile",
    ]);
    expect(referenceEvidence("x/m@mobile+full", message, COMPONENTS).map((e) => e.state)).toEqual([
      "full-content",
    ]);
    expect(
      referenceEvidence("x/m@scrolled-end+mobile", message, COMPONENTS).map((e) => e.state),
    ).toEqual(["scrolled-end"]);
  });

  it("counts links, mentions, cards and menus, and kinds only one component has", () => {
    const rich = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Hi <@U0123456789>, see <https://a.example|a> in <#C0123456789>",
          },
        },
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "link", url: "https://b.example" },
                { type: "broadcast", range: "here" },
              ],
            },
          ],
        },
        {
          type: "image",
          image_url: "https://cdn.block-kit.dev/samples/cat.da842b96.jpg",
          alt_text: "cat",
        },
        { type: "carousel", elements: [{ type: "card" }, { type: "card" }] },
      ],
    };
    expect(controlComponents(rich)).toMatchObject({
      mention: ["rich_text.user", "rich_text.channel", "rich_text.broadcast"],
      link: ["rich_text.link", "rich_text.link"],
      menu: ["image"],
      card: ["card", "card"],
    });
    const components = [
      ...COMPONENTS,
      component("carousel", ["default", "hover", "focus-visible", "toggled"]),
      component("rich_text.link", ["default", "hover", "focus-visible"], "link"),
    ];
    expect(referenceEvidence("x/r@hover-link-2", rich, components)[0]).toMatchObject({
      component: "rich_text.link",
      state: "hover",
    });
    expect(referenceEvidence("x/r@focus-arrow-2", rich, components)[0]).toMatchObject({
      component: "carousel",
      state: "focus-visible",
    });
  });

  it("covers a submitted modal's validation errors", () => {
    expect(referenceEvidence("x/f@submit-errors", modal, COMPONENTS)).toMatchObject([
      { component: "input", state: "validation-error", fact: "styles" },
    ]);
  });

  it("covers the behaviour of the components a recording's steps act on", () => {
    const evidence = behaviourEvidence("x/m@arrows", message, COMPONENTS, {
      steps: [{ click: "field-3" }, { key: "ArrowDown" }, { click: { role: "option", name: "A" } }],
      observations: [
        { focus: null, layers: [], activeOption: null, controls: {} },
        {
          focus: null,
          layers: [{ kind: "popover", role: "listbox", scrollTop: 0 }],
          activeOption: null,
          controls: {},
          action: null,
        },
        {
          focus: null,
          layers: [],
          activeOption: null,
          controls: {},
          action: { type: "block_actions" },
        },
      ],
    });
    expect(evidence.map((e) => `${e.component} ${e.state}`)).toEqual([
      "static_select default",
      "static_select focus-visible",
      "static_select open",
      "static_select selected",
    ]);
  });

  it("covers hover, loading, many items and toggled behaviour where a recording shows them", () => {
    const states = [
      ...COMPONENTS,
      component("carousel", [
        "default",
        "hover",
        "focus-visible",
        "toggled",
        "loading",
        "many-items",
      ]),
    ];
    const carousel = { blocks: [{ type: "carousel", elements: [] }] };
    const rest = { focus: null, layers: [], activeOption: null, controls: {} };
    const evidence = behaviourEvidence("x/c@scroll", carousel, states, {
      steps: [{ hover: "arrow-2" }, { click: "arrow-2" }],
      observations: [
        rest,
        { ...rest, tooltip: "Scroll right", busy: true },
        {
          ...rest,
          layers: [{ kind: "popover", role: "listbox", scrollTop: 40 }],
          controls: { "arrow-1": { disabled: "false" } },
        },
      ],
    });
    expect(evidence.map((e) => e.state)).toEqual([
      "default",
      "focus-visible",
      "hover",
      "loading",
      "many-items",
      "toggled",
    ]);
  });

  it("reads the stateStyles and scrollers a meta recorded", () => {
    const html = `<script type="application/json" id="sbk-reference-meta">${JSON.stringify({
      stateStyles: { "3": { target: "button-1", states: { ":hover": {}, ":active": {} } } },
      scrollers: [{ ref: "4", scrollWidth: 400, clientWidth: 320, scrollLeft: 0 }],
    })}</script>`;
    expect(referenceMeta(html)).toEqual({
      stateStyles: { "button-1": [":hover", ":active"] },
      scrollers: true,
    });
    expect(referenceMeta("<p></p>")).toEqual({});
  });

  it("covers what a probe's snapshot shows: a list opened, an option hovered or picked", () => {
    const steps = [{ click: "field-3" }, { hover: "option-2" }];
    const evidence = referenceEvidence(
      "x/m@open-hover-two",
      message,
      COMPONENTS,
      {},
      steps as never,
    );
    expect(evidence.map((e) => `${e.component} ${e.state}`)).toEqual(["static_select open"]);
    const withOption = [...COMPONENTS, component("option", ["default", "hover", "selected"], "x")];
    expect(
      referenceEvidence("x/m@open-hover-two", message, withOption, {}, steps as never).map(
        (e) => `${e.component} ${e.state}`,
      ),
    ).toEqual(["static_select open", "option hover"]);
    expect(
      referenceEvidence("x/m@picked", message, COMPONENTS, {}, [
        { click: "field-3" },
        { click: "option-2" },
      ] as never).map((e) => `${e.component} ${e.state}`),
    ).toEqual(["static_select selected"]);
  });

  it("covers many items for a block that scrolled itself", () => {
    const states = [...COMPONENTS, component("carousel", ["default", "many-items"])];
    const carousel = { blocks: [{ type: "carousel", elements: [] }] };
    const at = (scrollLeft: number) => ({
      focus: null,
      layers: [],
      activeOption: null,
      controls: { "scroller-1": { scrollLeft, scrollTop: 0, scrollWidth: 900, clientWidth: 400 } },
    });
    expect(
      behaviourEvidence("x/c@scroll", carousel, states, {
        steps: [{ scroll: "scroller-1", left: "end" }],
        observations: [at(0), at(500)],
      } as never).map((e) => e.state),
    ).toEqual(["default", "many-items"]);
  });

  it("maps a video's player and a tooltip to their components", () => {
    const components = [
      ...COMPONENTS,
      component("video", ["default", "hover"]),
      component("tooltip", ["default", "hover", "focus-visible"], "x"),
    ];
    const payload = {
      blocks: [{ type: "video" }, { type: "context_actions", elements: [{ type: "icon_button" }] }],
    };
    expect(
      referenceEvidence("x/v@hover-video-1", payload, components).map((e) => e.component),
    ).toEqual(["video"]);
    expect(
      referenceEvidence("x/v@hover-tooltip-1", payload, components).map((e) => e.component),
    ).toEqual(["tooltip"]);
  });

  it("credits the control that had keyboard focus at the snapshot", () => {
    const withOption = [...COMPONENTS, component("option", ["default", "focus-visible"], "x")];
    expect(
      referenceEvidence("x/m@open-focus-option-1", message, withOption, {
        focus: { target: "option-1", visible: true },
      }).map((e) => `${e.component} ${e.state}`),
    ).toEqual(["option focus-visible"]);
    expect(
      referenceEvidence("x/m@open-focus-option-1", message, withOption, {
        focus: { target: "option-1", visible: false },
      }),
    ).toEqual([]);
  });

  it("counts a multi-select's chips and a plan's sources", () => {
    expect(
      controlComponents({
        blocks: [
          { type: "input", element: { type: "multi_static_select", initial_options: [{}, {}] } },
          { type: "plan", tasks: [{ sources: [{ type: "url" }, { type: "url" }] }] },
        ],
      }),
    ).toMatchObject({
      chip: ["multi_static_select", "multi_static_select"],
      source: ["url_source", "url_source"],
    });
  });

  it("credits the option the arrow keys highlighted while focus stayed on the field", () => {
    const withOption = [...COMPONENTS, component("option", ["default", "focus-visible"], "x")];
    expect(
      referenceEvidence("x/m@open-focus-option-1", message, withOption, {
        focus: { target: "field-3", visible: true, active: "option-1" },
      }).map((e) => `${e.component} ${e.state}`),
    ).toEqual(["static_select focus-visible", "option focus-visible"]);
  });
});
