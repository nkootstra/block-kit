import { describe, expect, it } from "bun:test";
import {
  behaviourEvidence,
  controlComponents,
  controlNodes,
  referenceEvidence,
  referenceMeta,
  revealedBy,
} from "./captures";
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

/** An observation with nothing but the tooltip observe.js read. */
const showing = (tooltip: string | null) => ({
  focus: null,
  layers: [],
  activeOption: null,
  tooltip,
  controls: {},
});

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

  it("counts rich text entities, dates, emoji and code blocks the way Slack draws them", () => {
    const rich = {
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Hi :wave:", emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "On <!date^1767261600^{date}|Jan 1> and <!date^1767261600^{date}^https://a.example|Jan 1>\n```npm i```",
          },
        },
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "emoji", name: "basketball" },
                { type: "file", file_id: "F0123456789" },
                { type: "date", timestamp: 1767261600, format: "{date}", fallback: "Jan 1" },
                {
                  type: "date",
                  timestamp: 1767261600,
                  format: "{date}",
                  fallback: "Jan 1",
                  url: "https://b.example",
                },
                { type: "attachment_mention", url: "https://c.example", text: "A file" },
                { type: "citation", url: "https://d.example", text: "1", index: 1 },
                {
                  type: "work_object_mention",
                  entity_id: "E0123456789",
                  text: "A work object",
                  url: "https://e.example",
                },
                { type: "canvas_user_mention", user_id: "U0123456789" },
                { type: "workflow_mention", workflow_id: "Wf0123456789" },
              ],
            },
            { type: "rich_text_preformatted", elements: [{ type: "text", text: "x" }] },
          ],
        },
        // A file block is no rich text entity.
        { type: "file", external_id: "x", source: "remote" },
      ],
    };
    expect(controlComponents(rich)).toMatchObject({
      emoji: ["text-emoji", "rich_text.emoji"],
      date: ["mrkdwn-date", "rich_text.date"],
      link: [
        "mrkdwn-date",
        "rich_text.date",
        "rich_text.attachment_mention",
        "rich_text.citation",
        "rich_text.work_object_mention",
      ],
      entity: ["rich_text.file", "rich_text.work_object_mention", "rich_text.workflow_mention"],
      mention: ["rich_text.canvas_user_mention"],
      copy: ["code-fence", "rich_text.rich_text_preformatted"],
    });
  });

  it("covers a submitted modal's validation errors", () => {
    expect(referenceEvidence("x/f@submit-errors", modal, COMPONENTS)).toMatchObject([
      { component: "input", state: "validation-error", fact: "styles" },
    ]);
  });

  it("covers the dispatch configuration of an input a recording types into and submits", () => {
    const states = [
      ...COMPONENTS,
      {
        ...component("dispatch_action_config", ["default", "pressed"]),
        match: (o: Record<string, unknown>) => o.dispatch_action === true,
      },
    ];
    const block = (dispatch: boolean) => ({
      blocks: [
        {
          type: "input",
          label: { type: "plain_text", text: "Email" },
          element: { type: "email_text_input", action_id: "email" },
          ...(dispatch && { dispatch_action: true }),
        },
      ],
    });
    const recording = {
      steps: [{ click: "input-1" }, { type: "a@example.com" }, { key: "Enter" }],
      observations: [],
    };
    const dispatch = (payload: unknown) =>
      behaviourEvidence("x/d@enter", payload, states, recording as never)
        .filter((e) => e.component === "dispatch_action_config")
        .map((e) => e.state);
    expect(dispatch(block(true))).toEqual(["default", "pressed"]);
    expect(dispatch(block(false))).toEqual([]);
  });

  it("covers the many items of the component a many-items fixture was written for", () => {
    const states = [
      ...COMPONENTS,
      component("rich_text.rich_text_list", ["default", "many-items"], "x"),
    ];
    // Moving through the items: Tab or the arrow keys, several times.
    const tabs = {
      steps: [{ click: "mention-1" }, { key: "Tab" }, { key: "Tab" }],
      observations: [],
    };
    const many = (name: string, recording: unknown = tabs) =>
      behaviourEvidence(name, { blocks: [] }, states, recording as never)
        .filter((e) => e.component === "rich_text.rich_text_list")
        .map((e) => e.state);
    expect(many("extra/fidelity/rich-text-rich-text-list/many-items@tab")).toEqual(["many-items"]);
    expect(many("extra/fidelity/rich-text-rich-text-list/mixed@tab")).toEqual([]);
    // A poke at one item doesn't move through them.
    const poke = { steps: [{ hover: "mention-2" }, { click: "mention-2" }], observations: [] };
    expect(many("extra/fidelity/rich-text-rich-text-list/many-items@poke-mention-2", poke)).toEqual(
      [],
    );
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
      measured: true,
      overflows: true,
    });
    expect(referenceMeta("<p></p>")).toEqual({});
  });

  it("counts a plain capture's control without an :active rule as no pressed style", () => {
    const html = `<script type="application/json" id="sbk-reference-meta">${JSON.stringify({
      targets: { "field-1": "3", "field-2": "4" },
      stateStyles: { "4": { target: "field-2", states: { ":active": {} } } },
      motion: { "3": { cursor: "pointer" } },
    })}</script>`;
    const meta = referenceMeta(html);
    expect(meta).toMatchObject({ targets: ["field-1", "field-2"], motionFacts: true });
    // It recorded no scroll container, so nothing scrolls sideways at its width.
    expect(meta).toMatchObject({ measured: true, overflows: false });
    const twoSelects = {
      blocks: [
        {
          type: "actions",
          elements: [
            { type: "users_select", action_id: "u" },
            { type: "static_select", action_id: "s", options: [] },
          ],
        },
      ],
    };
    const states = [
      component("users_select", ["default", "pressed"]),
      component("static_select", ["default", "pressed"]),
    ];
    const pressed = (name: string) =>
      referenceEvidence(name, twoSelects, states, meta)
        .filter((e) => e.state === "pressed")
        .map((e) => `${e.component} ${e.what}`);
    expect(pressed("x/s")).toEqual([
      "static_select state styles in x/s",
      "users_select no :active rule for field-1 in x/s",
    ]);
    // Only a plain capture reads them at rest.
    expect(pressed("x/s@open")).toEqual(["static_select state styles in x/s@open"]);
  });

  it("tells a scroll container that fits from one that overflows, also after +full widened it", () => {
    const meta = (m: object) =>
      referenceMeta(
        `<script type="application/json" id="sbk-reference-meta">${JSON.stringify(m)}</script>`,
      );
    const fits = [{ ref: "6", scrollWidth: 432, clientWidth: 432, scrollLeft: 0 }];
    expect(meta({ scrollers: fits, full: { widenedBy: 0, expanded: 0 } }).overflows).toBe(false);
    // Measured once the preview was widened by what the carousel hid.
    const widened = [{ ref: "3", scrollWidth: 1408, clientWidth: 1408, scrollLeft: 0 }];
    expect(meta({ scrollers: widened, full: { widenedBy: 976, expanded: 0 } }).overflows).toBe(
      true,
    );
  });

  it("finds a collapsed plan's and task card's insides behind their pill", () => {
    const payload = {
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "See <https://example.com|this>" } },
        {
          type: "plan",
          title: "Plan",
          tasks: [
            {
              task_id: "1",
              title: "One",
              sources: [{ type: "url", url: "https://example.com/a", text: "A" }],
            },
          ],
        },
        {
          type: "task_card",
          task_id: "2",
          title: "Card",
          details: {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "link", url: "https://example.com/b", text: "B" }],
              },
            ],
          },
          sources: [{ type: "url", url: "https://example.com/c", text: "C" }],
        },
      ],
    };
    // The section's link is there at rest; the task card's is behind the second pill.
    expect(revealedBy(payload, "link-1")).toBeUndefined();
    expect(revealedBy(payload, "link-2")).toBe("pill-2");
    expect(revealedBy(payload, "source-1")).toBe("pill-1");
    expect(revealedBy(payload, "source-2")).toBe("pill-2");
    expect(revealedBy(payload, "task-1")).toBe("pill-1");
    expect(revealedBy(payload, "pill-2")).toBeUndefined();
    expect(controlNodes(payload).source?.map((c) => c.key)).toEqual(["sources", "sources"]);
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

  it("takes a dialog's Confirm and Cancel for the selection dialog when no confirm dialog is set", () => {
    const dialog: Component = {
      ...component("select-dialog", ["open", "hover", "focus-visible", "pressed", "selected"]),
      match: (o, key) => key === "accessory" && o.type === "multi_static_select",
    };
    const states = [...COMPONENTS, component("confirm", ["open", "hover"], "x"), dialog];
    const accessory = {
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Pick" },
          accessory: { type: "multi_static_select", action_id: "m", options: [] },
        },
      ],
    };
    const confirming = {
      blocks: [{ type: "actions", elements: [{ type: "button", confirm: {} }] }],
    };
    const hovered = (payload: unknown, button: string) =>
      referenceEvidence("x/m@dialog-hover", payload, states, {}, [
        { click: "button-1" },
        { hover: button },
      ] as never).map((e) => `${e.component} ${e.state}`);
    expect(hovered(accessory, "confirm-1")).toEqual(["select-dialog hover"]);
    expect(hovered(accessory, "deny-1")).toEqual(["select-dialog hover"]);
    expect(hovered(confirming, "confirm-1")).toEqual(["confirm hover"]);
    // An option picked in the dialog's list shows as chosen there until Confirm.
    expect(
      referenceEvidence("x/m@dialog-pick", accessory, states, {}, [
        { click: "field-1" },
        { click: { role: "combobox", name: "Pick" } },
        { click: "option-1" },
      ] as never).map((e) => `${e.component} ${e.state}`),
    ).toContain("select-dialog selected");
    // Its list stays open, showing the pick with its check mark.
    const withOption = [...states, component("option", ["default", "hover", "selected"], "x")];
    expect(
      referenceEvidence("x/m@dialog-pick", accessory, withOption, {}, [
        { click: "field-1" },
        { click: { role: "combobox", name: "Pick" } },
        { click: "option-1" },
      ] as never).map((e) => `${e.component} ${e.state}`),
    ).toContain("option selected");
  });

  it("covers a chart's table modal, opened from its menu", () => {
    const states = [
      ...COMPONENTS,
      {
        ...component("chart-table-modal", ["open", "hover", "focus-visible"]),
        match: (o: Record<string, unknown>) => o.type === "data_visualization",
      },
    ];
    const chart = { blocks: [{ type: "data_visualization", title: "T", chart: {} }] };
    expect(
      referenceEvidence("x/c@table-hover-close-1", chart, states, {}, [
        { click: "menu-1" },
        { click: { role: "menuitem", name: "View as table" } },
        { hover: "close-1" },
      ] as never).map((e) => `${e.component} ${e.state}`),
    ).toEqual(["chart-table-modal open", "chart-table-modal hover"]);
  });

  it("covers the option groups of a list a probe opens", () => {
    const states = [...COMPONENTS, component("option_group", ["open"], "x")];
    const grouped = {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "g",
              option_groups: [{ label: { type: "plain_text", text: "One" }, options: [] }],
            },
          ],
        },
      ],
    };
    const steps = [{ click: "field-1" }, { key: "ArrowDown" }];
    expect(
      referenceEvidence("x/g@open-field-1", grouped, states, {}, steps.slice(0, 1) as never).map(
        (e) => `${e.component} ${e.state}`,
      ),
    ).toEqual(["static_select open", "option_group open"]);
    expect(
      behaviourEvidence("x/g@open-field-1", grouped, states, {
        steps,
        observations: [
          { focus: null, layers: [{ kind: "popover", role: "listbox", scrollTop: 0 }] },
        ],
      } as never)
        .filter((e) => e.component === "option_group")
        .map((e) => e.state),
    ).toEqual(["open"]);
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

  // catalog/rich-text/emoji@hover-emoji-1 and kitchen-sink@focus-copy-1 draw Slack's tooltip over
  // the control they hover or focus.
  it("credits the tooltip a hovered or focused control shows in its reference", () => {
    const components = [...COMPONENTS, component("tooltip", ["hover", "focus-visible"], "x")];
    const html = '<div data-qa="tooltip-tip" class="c-tooltip__tip">Copy</div>';
    const meta = referenceMeta(html);
    expect(meta).toEqual({ tooltip: true });
    const tooltip = (name: string, m = meta) =>
      referenceEvidence(name, message, components, m)
        .filter((e) => e.component === "tooltip")
        .map((e) => `${e.state} ${e.theme} ${e.width}`);
    expect(tooltip("x/m@hover-button-1+mobile")).toEqual(["hover light mobile"]);
    expect(tooltip("x/m@focus-button-1+dark")).toEqual(["focus-visible dark desktop"]);
    expect(tooltip("x/m@hover-button-1", {})).toEqual([]);
  });

  it("credits the tooltip a recording saw", () => {
    const components = [
      ...COMPONENTS,
      component("tooltip", ["default", "hover", "focus-visible"], "x"),
    ];
    const evidence = behaviourEvidence("x/m@poke", message, components, {
      steps: [{ hover: "button-1" }, { key: "Escape" }],
      observations: [showing(null), showing("Copy"), showing(null)],
    });
    expect(evidence.filter((e) => e.component === "tooltip").map((e) => e.state)).toEqual([
      "default",
      "focus-visible",
      "hover",
    ]);
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

  it("credits the highlighted option when the focused field is no target (a select's dialog)", () => {
    const withOption = [...COMPONENTS, component("option", ["default", "focus-visible"], "x")];
    expect(
      referenceEvidence("x/m@open-focus-option-1", message, withOption, {
        focus: { visible: true, active: "option-1" },
      }).map((e) => `${e.component} ${e.state}`),
    ).toEqual(["option focus-visible"]);
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
