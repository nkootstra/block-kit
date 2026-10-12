/**
 * What the capture kinds beyond plain references show, as inventory evidence (inventory.ts): the
 * real-input references (`@hover-<target>`, `@focus-<target>`, names.ts), the state styles and
 * scroll containers a reference's meta records (snapshot.js), `+full` and `@scrolled-end`,
 * `@submit-errors`, and behaviour recordings (probes.ts). Pure, so it can be tested on small
 * inputs; generate.ts reads the metas and recordings.
 */
import { objects } from "../coverage";
import type { InputState } from "../names";
import { parseInputState, parseReferenceName } from "../names";
import type { Behaviour, Step } from "../probes";
import { KIND_OF_ELEMENT, type Kind, parseTarget } from "../targets";
import type { FactKind, StateId, Theme, Width } from "./axes";
import type { Component } from "./components";

type Obj = Record<string, unknown>;

/** What a reference's meta adds, read by generate.ts (`referenceMeta`). */
export interface ReferenceMeta {
  /** Per control address, the pseudo-states its state styles recorded (`:hover`, `:active`). */
  stateStyles?: Record<string, string[]>;
  /** Whether the meta recorded the preview's horizontal scroll containers. */
  scrollers?: boolean;
  /** The control that had focus at the snapshot, and whether it was drawn as keyboard focus. */
  focus?: { target: string; visible: boolean; active?: string };
}

export interface Evidence {
  component: string;
  state: StateId;
  theme: Theme | "any";
  width: Width | "any";
  fact: FactKind;
  what: string;
}

/** Reads the parts of a reference's meta the inventory counts. */
export function referenceMeta(html: string): ReferenceMeta {
  const json = /id="sbk-reference-meta"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) return {};
  const meta = JSON.parse(json) as {
    stateStyles?: Record<string, { target: string; states: Record<string, unknown> }>;
    scrollers?: unknown[];
    focus?: { target: string; visible: boolean; active?: string };
  };
  const out: ReferenceMeta = {};
  if (meta.stateStyles)
    out.stateStyles = Object.fromEntries(
      Object.values(meta.stateStyles).map((s) => [s.target, Object.keys(s.states)]),
    );
  if (meta.scrollers?.length) out.scrollers = true;
  if (meta.focus) out.focus = meta.focus;
  return out;
}

/**
 * The component behind each control address, by kind, in document order, as targets.ts counts
 * controls: one per checkbox or radio option, two for a datetime picker (its date and its time),
 * and a modal's submit and cancel are its frame.
 */
export function controlComponents(payload: unknown): Partial<Record<Kind, string[]>> {
  const out: Partial<Record<Kind, string[]>> = {};
  const push = (kind: Kind, id: string, times = 1) => {
    for (let i = 0; i < times; i++) (out[kind] ??= []).push(id);
  };
  for (const [o, key] of objects(payload)) {
    const type = typeof o.type === "string" ? o.type : "";
    // Links and mentions in rich text, and in mrkdwn and markdown text in the order they appear.
    if (type === "link") push("link", "rich_text.link");
    if (MENTIONS.has(type)) push("mention", `rich_text.${type}`);
    if ((type === "mrkdwn" || type === "markdown") && typeof o.text === "string")
      for (const [m] of o.text.matchAll(INLINE))
        // Any other `<…>` (a date) is consumed so the URL inside isn't counted as a bare link.
        if (
          m.startsWith("<") &&
          !/^<(@|#|!subteam\^|!here|!channel|!everyone|https?:|mailto:)/.test(m)
        )
          continue;
        else if (!m.startsWith("<@") && !m.startsWith("<#") && !m.startsWith("<!"))
          push("link", "rich_text.link");
        else
          push(
            "mention",
            m.startsWith("<@")
              ? "rich_text.user"
              : m.startsWith("<#")
                ? "rich_text.channel"
                : m.startsWith("<!subteam")
                  ? "rich_text.usergroup"
                  : "rich_text.broadcast",
          );
    if (type === "card") push("card", "card");
    if (type === "plan" || type === "task_card") push("pill", type);
    if (type === "url" && key === "sources") push("source", "url_source");
    // A multi-select's chips: one per initial option, user, conversation or channel.
    if (type.startsWith("multi_") && key !== "accessory")
      for (const field of [
        "initial_options",
        "initial_users",
        "initial_conversations",
        "initial_channels",
      ])
        if (Array.isArray(o[field])) push("chip", type, (o[field] as unknown[]).length);
    if (BLOCK_KEYS.has(key) && (type === "image" || type === "data_visualization"))
      push("menu", type);
    const kind = KIND_OF_ELEMENT[type];
    if (!kind) continue;
    const options = Array.isArray(o.options) ? o.options.length : 1;
    push(
      kind,
      type,
      kind === "checkbox" || kind === "radio"
        ? options
        : type === "datetimepicker" || type === "feedback_buttons"
          ? 2
          : 1,
    );
  }
  const view = payload as Obj | null;
  if (view?.type === "modal") {
    if (view.submit) push("submit", "modal-frame");
    if (view.close) push("cancel", "modal-frame");
  }
  return out;
}

const MENTIONS = new Set(["user", "channel", "usergroup", "broadcast"]);
const BLOCK_KEYS = new Set([undefined, "blocks", "child_blocks"]);
/**
 * mrkdwn's `<@U…>`, `<#C…>`, `<!subteam^…>`, `<!here>`, `<https://…>` and bare URLs (which Slack links
 * too), markdown's `[a](b)`, in the order they appear.
 */
const INLINE =
  /<@[UW][^>]*>|<#C[^>]*>|<!subteam\^[^>]*>|<!(?:here|channel|everyone)[^>]*>|<(?:https?:|mailto:)[^>]*>|<[^>]*>|\]\((?:https?:|mailto:)[^)]*\)|\bhttps?:\/\/[^\s<>|)]+/g;

/**
 * Kinds that only one component has: an address of the kind is that component wherever the
 * fixture has it (a data table's column headers and pages, a carousel's arrows, a confirm dialog's
 * buttons, a list's options and a menu's items).
 */
const ONLY: Partial<Record<Kind, [string, (root: Obj, nodes: Obj[]) => boolean]>> = {
  column: ["data_table", (_, n) => n.some((o) => o.type === "data_table")],
  page: ["data_table", (_, n) => n.some((o) => o.type === "data_table")],
  arrow: ["carousel", (_, n) => n.some((o) => o.type === "carousel")],
  more: ["show-more", (_, n) => n.some((o) => o.type === "section")],
  action: ["message-actions", (root) => root.type !== "modal" && root.type !== "home"],
  option: ["option", (_, n) => n.some((o) => Array.isArray(o.options))],
  menuitem: ["option", (_, n) => n.some((o) => Array.isArray(o.options))],
  confirm: ["confirm", (_, n) => n.some((o) => "confirm" in o)],
  deny: ["confirm", (_, n) => n.some((o) => "confirm" in o)],
  collapse: ["container", (_, n) => n.some((o) => o.type === "container")],
  task: ["plan", (_, n) => n.some((o) => o.type === "plan")],
  contact: ["contact_card", (_, n) => n.some((o) => o.type === "contact_card")],
  expand: ["image", (_, n) => n.some((o) => o.type === "image" && !!o.title)],
  sender: ["message-header", (root) => root.type !== "modal" && root.type !== "home"],
  time: ["message-header", (root) => root.type !== "modal" && root.type !== "home"],
  video: ["video", (_, n) => n.some((o) => o.type === "video")],
  // The tooltip a card, a chart, an emoji, a feedback button or an icon button shows.
  tooltip: [
    "tooltip",
    (_, n) =>
      n.some((o) =>
        ["card", "data_visualization", "feedback_buttons", "icon_button", "emoji"].includes(
          o.type as string,
        ),
      ),
  ],
};
const SCROLLING = ["carousel", "data_table", "table", "data_visualization"];

const componentAt = (payload: unknown, address: string): string | undefined => {
  const target = parseTarget(address);
  if (!target) return undefined;
  const only = ONLY[target.kind];
  // A block that scrolls itself: the fixture's first carousel, data table, table or chart.
  if (target.kind === "scroller")
    return [...objects(payload)].map(([o]) => o.type as string).find((t) => SCROLLING.includes(t));
  if (only)
    return only[1](
      (payload ?? {}) as Obj,
      [...objects(payload)].map(([o]) => o),
    )
      ? only[0]
      : undefined;
  return controlComponents(payload)[target.kind]?.[target.index - 1];
};

/** The components a fixture holds that have `state`. */
function withState(payload: unknown, components: Component[], state: StateId): string[] {
  const root = (payload ?? {}) as Obj;
  const found = new Set<string>();
  for (const [node, key] of objects(payload))
    for (const c of components)
      if (c.states.includes(state) && c.match(node, key, root)) found.add(c.id);
  return [...found];
}

/** Kinds a click opens a layer from, and kinds a click toggles. */
const OPENERS = new Set<Kind>(["field", "overflow", "menu", "column"]);
const TOGGLERS = new Set<Kind>(["more", "collapse", "pill", "task", "expand", "arrow", "page"]);

const PSEUDO: Record<string, StateId> = {
  ":hover": "hover",
  ":active": "pressed",
  ":focus-visible": "focus-visible",
};
const INPUT: Record<InputState["input"], StateId> = { hover: "hover", focus: "focus-visible" };

/** What a reference shows beyond the payload states inventory.ts already reads from its name. */
export function referenceEvidence(
  name: string,
  payload: unknown,
  components: Component[],
  meta: ReferenceMeta = {},
  /** For a probe's snapshot (probes.ts probeSnapshots): the steps that led there. */
  steps?: Step[],
): Evidence[] {
  const { interaction, theme, mobile, full } = parseReferenceName(name);
  const width: Width = mobile ? "mobile" : "desktop";
  const has = (id: string, state: StateId) =>
    components.some((c) => c.id === id && c.states.includes(state));
  const out: Evidence[] = [];
  const styles = (component: string, state: StateId, what: string) => {
    if (has(component, state)) out.push({ component, state, theme, width, fact: "styles", what });
  };

  let input: InputState | undefined;
  try {
    input = parseInputState(interaction);
  } catch {
    input = undefined;
  }
  if (input) {
    const component = componentAt(payload, `${input.target.kind}-${input.target.index}`);
    if (component) styles(component, INPUT[input.input], `reference ${name}`);
  }
  if (interaction === "submit-errors")
    for (const id of withState(payload, components, "validation-error"))
      styles(id, "validation-error", `reference ${name}`);
  if (full)
    for (const id of withState(payload, components, "full-content"))
      styles(id, "full-content", `reference ${name}`);
  if (interaction === "scrolled-end")
    for (const id of withState(payload, components, "scrolled-end"))
      styles(id, "scrolled-end", `reference ${name}`);

  if (steps) {
    const what = `reference ${name}`;
    const opened = new Set<string>();
    let last: string | undefined;
    for (const step of steps) {
      const t = "click" in step ? step.click : "hover" in step ? step.hover : undefined;
      if (typeof t !== "string") continue;
      const kind = parseTarget(t)?.kind;
      const id = componentAt(payload, t);
      if ("click" in step && kind && OPENERS.has(kind) && id) opened.add(id);
      // Picking an option or a menu item closes what it was in, and selects.
      if ("click" in step && (kind === "option" || kind === "menuitem")) {
        for (const o of opened) styles(o, "selected", what);
        opened.clear();
      }
      if ("click" in step && kind && TOGGLERS.has(kind) && id) styles(id, "toggled", what);
      last = "hover" in step ? t : undefined;
    }
    for (const id of opened) styles(id, "open", what);
    if (last) {
      const id = componentAt(payload, last);
      if (id) styles(id, "hover", what);
    }
  }

  // Keyboard focus at the snapshot (snapshot.js records the focused control): what a probe's
  // arrow keys or Tab reached, an option in an open list, a confirm dialog's button, a chip.
  if (meta.focus?.visible) {
    const id = componentAt(payload, meta.focus.target);
    if (id) styles(id, "focus-visible", `keyboard focus in ${name}`);
    // The option the arrow keys highlighted while focus stayed on the field.
    const active = meta.focus.active && componentAt(payload, meta.focus.active);
    if (active) styles(active, "focus-visible", `keyboard highlight in ${name}`);
  }

  for (const [address, states] of Object.entries(meta.stateStyles ?? {})) {
    const component = componentAt(payload, address);
    if (!component) continue;
    for (const pseudo of states)
      if (PSEUDO[pseudo]) styles(component, PSEUDO[pseudo], `state styles in ${name}`);
  }
  if (meta.scrollers && !full)
    for (const id of withState(payload, components, "scrolled-end"))
      out.push({
        component: id,
        state: "scrolled-end",
        theme: "any",
        width,
        fact: "behaviour",
        what: `scroll containers in ${name}`,
      });
  return out;
}

/** The control addresses a probe's steps act on. */
const addressesOf = (steps: Step[]) =>
  steps.flatMap((s) => {
    const t = "click" in s ? s.click : "hover" in s ? s.hover : undefined;
    return typeof t === "string" ? [t] : [];
  });

/**
 * What a behaviour recording shows: behaviour of the components its steps act on, at rest and
 * under keyboard focus, plus open when a layer opened, selected when a payload arrived, and
 * validation-error for `@submit-errors`.
 */
export function behaviourEvidence(
  name: string,
  payload: unknown,
  components: Component[],
  recording: Behaviour,
): Evidence[] {
  const { interaction } = parseReferenceName(name);
  const { steps, observations } = recording;
  const states: StateId[] = ["default", "focus-visible"];
  // A hover step: the hover's behaviour (a tooltip and its delay, a toolbar appearing).
  if (steps.some((s) => "hover" in s)) states.push("hover");
  // A click: what a press does.
  if (steps.some((s) => "click" in s)) states.push("pressed");
  if (observations.some((o) => o.layers?.length > 0)) states.push("open");
  if (observations.some((o) => o.action)) states.push("selected");
  if (observations.some((o) => o.busy)) states.push("loading");
  // A list or a menu that scrolled: many items.
  if (observations.some((o) => o.layers?.some((l) => l.scrollTop > 0))) states.push("many-items");
  // A control whose expanded, pressed, sort or label state changed between observations.
  const toggles = (key: string) =>
    new Set(observations.map((o) => JSON.stringify(o.controls?.[key] ?? null))).size > 1;
  const changed = [...new Set(observations.flatMap((o) => Object.keys(o.controls ?? {})))].filter(
    toggles,
  );
  if (changed.some((a) => !/^(field|input|scroller)-/.test(a))) states.push("toggled");
  // A block that scrolled itself (a scroll step, or arrows that scroll it): many items.
  if (
    changed.some((a) => a.startsWith("scroller-")) &&
    observations.some((o) =>
      Object.entries(o.controls ?? {}).some(
        ([a, c]) =>
          a.startsWith("scroller-") && (Number(c.scrollLeft) > 0 || Number(c.scrollTop) > 0),
      ),
    ) &&
    !states.includes("many-items")
  )
    states.push("many-items");
  const ids = new Set(
    [...addressesOf(steps), ...changed].flatMap((a) => componentAt(payload, a) ?? []),
  );
  if (interaction === "submit-errors") {
    states.push("validation-error");
    for (const id of withState(payload, components, "validation-error")) ids.add(id);
  }
  const out: Evidence[] = [];
  for (const id of ids)
    for (const state of states)
      if (components.some((c) => c.id === id && c.states.includes(state)))
        out.push({
          component: id,
          state,
          theme: "any",
          width: "any",
          fact: "behaviour",
          what: `behaviour recording ${name}`,
        });
  return out;
}
