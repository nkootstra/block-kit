/**
 * The fidelity inventory: every fact about how Slack renders and behaves that the package has to
 * match, as cells `<component> × <state> × <theme> × <width> × <fact kind>` (axes.ts,
 * components.ts), each marked with what already records it and, when nothing does, how Block Kit
 * Builder could capture it. generate.ts reads the repository and writes it out; this module is
 * pure so it can be tested on small inputs.
 */
import { expectedStates, objects, OPENS } from "../coverage";
import { payloadName } from "../lock";
import { parseInputState, parseReferenceName } from "../names";
import type { Behaviour, Step } from "../probes";
import {
  FACT_KINDS,
  FACT_STATES,
  OVERFLOW_STATES,
  type FactKind,
  type PayloadEvent,
  STATE_WEIGHT,
  STATES,
  type StateId,
  type Surface,
  type Theme,
  THEMES,
  VARIES,
  type Width,
  WIDTHS,
} from "./axes";
import { behaviourEvidence, type ReferenceMeta, referenceEvidence } from "./captures";
import { type Component, surfaceOf } from "./components";
import type { TestFacts } from "./interactionTests";
import {
  type Discovered,
  type Discovery,
  discover,
  type DiscoveryRule,
  type FamilyReport,
} from "./stylesheet";

type Obj = Record<string, unknown>;

/** What the repository holds today, read by generate.ts. */
export interface Sources {
  /** Fixture payloads by name. */
  payloads: Map<string, unknown>;
  /**
   * Reference names, with whether the reference's meta recorded motion, and the state styles and
   * scroll containers it recorded (captures.ts).
   */
  references: Map<string, { motion: boolean } & ReferenceMeta>;
  /** Behaviour recordings (`<fixture>@<probe>.behaviour.json`, probes.ts), with their contents. */
  behaviour?: Map<string, Behaviour>;
  /** Behaviour probes (`<fixture>@<probe>.probe.json`); one with a snapshot names a reference. */
  probes?: Set<string>;
  /** The references probes capture (probes.ts probeSnapshots), with the steps that lead there. */
  snapshots?: Map<string, Step[]>;
  /** Payload recordings by name (`<fixture>@<interaction>`), with their contents. */
  recordings: Map<string, unknown>;
  /** Interaction test groups by title, with the facts each asserts. */
  interactionTests: Record<string, TestFacts[]>;
  /** References listed in the pixel baseline, and those with open text-run findings. */
  baseline: Set<string>;
  textFindings: Map<string, number>;
  /** Renderer types the package implements, per registry. */
  implemented: { blocks: Set<string>; elements: Set<string>; "rich-text": Set<string> };
  /** Source files that exist, for components implemented outside a registry. */
  files: Set<string>;
  /** Rules read from Block Kit Builder's stylesheets (stylesheet.ts), when given. */
  stylesheet?: DiscoveryRule[];
}

/**
 * How an uncovered cell can be captured in Block Kit Builder:
 * - `a`: the existing flow (capture.js and snapshot.js, Actions Preview) as it is;
 * - `b`: needs a new capture capability (`capability` names it, see EXTENSIONS);
 * - `c`: Block Kit Builder can't show it (`how` says why).
 */
export interface Capture {
  method: "a" | "b" | "c";
  capability:
    | "reference"
    | "fixture-state"
    | "actions-preview"
    | "real-input"
    | "css-rules"
    | "behaviour-probe"
    | "validation-probe"
    | "unclipped"
    | "scrolled-end"
    | "unobservable";
  how: string;
  /** No fixture shows the component in this state yet: write the payload first. */
  needsFixture: boolean;
  /** Rests on an assumption about the Builder that hasn't been checked. */
  verify?: boolean;
}

export interface Cell {
  component: string;
  state: StateId | PayloadEvent;
  theme: Theme | "any";
  width: Width | "any";
  fact: FactKind;
  covered: boolean;
  evidence: string[];
  capture?: Capture;
  /** Ordering weight: component tier and state weight. */
  value: number;
  /** `builder-css`: the state is only known from Block Kit Builder's stylesheets. */
  origin: "curated" | "builder-css";
  /** Builder stylesheet rules that style this component in this state, for this fact kind. */
  rules?: number;
  /** Why the cell doesn't apply; such cells aren't counted as covered or uncovered. */
  na?: string;
}

export type CellKey = Pick<Cell, "component" | "state" | "theme" | "width" | "fact">;

export interface ComponentReport {
  id: string;
  name: string;
  kind: Component["kind"];
  source: Component["source"];
  docs?: string;
  surfaces: Surface[];
  tier: number;
  implemented: boolean;
  fixtures: string[];
  notes?: string;
}

const DOCS = "https://docs.slack.dev/reference/block-kit/";

/** A component instance found in a fixture: its object and the fixture's surface. */
interface Hit {
  fixture: string;
  node: Obj;
  surface: Surface;
}

/** Every object in every fixture that each component matches. */
export function findComponents(components: Component[], payloads: Map<string, unknown>) {
  const hits = new Map<string, Hit[]>(components.map((c) => [c.id, []]));
  for (const [fixture, payload] of payloads) {
    const root = payload as Obj;
    const surface = surfaceOf(root);
    for (const [node, key] of objects(payload))
      for (const c of components)
        if (c.match(node, key, root)) hits.get(c.id)!.push({ fixture, node, surface });
  }
  return hits;
}

/** The folder of a component's fixtures under fixtures/extra/fidelity/. */
export const fidelityDir = (id: string) => id.replaceAll(".", "-").replaceAll("_", "-");

/**
 * The state a fixture written for the inventory shows of a component: one at
 * `extra/fidelity/<component>/<state>` exists to show that state, which the payload heuristics
 * can't always read (a card's variants, a long quote).
 */
export function fidelityState(fixture: string, id: string): StateId | undefined {
  const [extra, fidelity, dir, state] = fixture.split("/");
  if (extra !== "extra" || fidelity !== "fidelity" || dir !== fidelityDir(id)) return undefined;
  return (STATES as readonly string[]).includes(state ?? "") ? (state as StateId) : undefined;
}

/** Whether a fixture's instance of a component shows a state set by its payload. */
export function showsState(
  id: string,
  hit: { fixture: string; node: Obj },
  state: StateId,
): boolean {
  return payloadStates(hit.node).includes(state) || fidelityState(hit.fixture, id) === state;
}

const INITIAL = /^initial_/;
const MANY = 6;
const LONG = 150;

const strings = (node: unknown): string[] =>
  [...objects(node)].flatMap(([o]) => Object.values(o).filter((v) => typeof v === "string"));

/**
 * The states a payload puts a component in before anyone touches it. A fixture with the
 * component shows it `default`; the rest depend on what the payload sets.
 */
export function payloadStates(node: Obj): StateId[] {
  const states: StateId[] = ["default"];
  const keys = Object.keys(node);
  const hasInitial = keys.some((k) => INITIAL.test(k));
  if (hasInitial) states.push("initial-value");
  else if ("placeholder" in node || /input|select|picker/.test(String(node.type)))
    states.push("empty");
  const arrays = Object.values(node).filter(Array.isArray) as unknown[][];
  if (arrays.some((a) => a.length >= MANY)) states.push("many-items");
  const mixed =
    "option_groups" in node ||
    "style" in node ||
    "level" in node ||
    "width" in node ||
    "slack_file" in node ||
    (node.type === "input" &&
      ("optional" in node || "hint" in node || "dispatch_action" in node)) ||
    "multiline" in node ||
    arrays.some((a) =>
      a.some((o) => o && typeof o === "object" && ("description" in o || "url" in o)),
    ) ||
    new Set(
      arrays
        .flat()
        .map((o) => (o as Obj | null)?.type)
        .filter(Boolean),
    ).size > 1;
  if (mixed) states.push("mixed");
  if (strings(node).some((s) => s.length >= LONG)) states.push("long-content");
  if (node.submit_disabled === true) states.push("disabled");
  return states;
}

/**
 * The states a reference shows of each component in its fixture: the payload states without an
 * interaction; with one, the state it put a component in.
 */
/**
 * Interactions captures.ts reads instead (real input, the scrolled end, a submitted modal, a probe's
 * snapshot): they don't put any component in its toggled state.
 */
function capturedElsewhere(fixture: string, interaction: string, probes?: Set<string>): boolean {
  if (interaction === "scrolled-end" || interaction === "submit-errors") return true;
  if (probes?.has(`${fixture}@${interaction}`)) return true;
  try {
    return parseInputState(interaction) !== undefined;
  } catch {
    return true;
  }
}

function referenceStates(
  interaction: string | undefined,
  component: Component,
  hits: Hit[],
  fixture: string,
  opener: string | undefined,
): StateId[] {
  const mine = hits.filter((h) => h.fixture === fixture);
  if (mine.length === 0) return [];
  if (!interaction)
    return [
      ...new Set([
        ...mine.flatMap((h) => payloadStates(h.node)),
        ...(fidelityState(fixture, component.id) ? [fidelityState(fixture, component.id)!] : []),
        // Slack's stylesheet varies it by the surface it's on.
        ...(mine.some((h) => h.surface === component.variantSurface) ? (["mixed"] as const) : []),
      ]),
    ];
  if (interaction === "open")
    return opener === component.id || (component.id === "option_group" && opener) ? ["open"] : [];
  if (interaction === "confirm") return component.id === "confirm" ? ["open"] : [];
  if (interaction === "dialog") return component.id === "select-dialog" ? ["open"] : [];
  // Fixture-specific (states.ts STATES): a disclosure in its other position.
  const toggles = TOGGLES[interaction];
  if (toggles && !toggles.includes(component.id)) return [];
  return component.states.includes("toggled") ? ["toggled"] : [];
}

/** The components a fixture-specific state (states.ts STATES) toggles. */
const TOGGLES: Record<string, string[]> = {
  expanded: ["plan", "task_card"],
  "tasks-collapsed": ["plan"],
  collapsed: ["container"],
  hidden: ["image"],
  "sort-asc": ["data_table"],
  "page-2": ["data_table"],
  scrolled: ["carousel"],
};

/** The type of the first control `@open` opens in a payload, in document order (states.ts). */
export function firstOpener(payload: unknown): string | undefined {
  for (const [o] of objects(payload))
    if (typeof o.type === "string" && OPENS.test(o.type)) return o.type;
  return undefined;
}

const themesFor = (fact: FactKind): (Theme | "any")[] =>
  VARIES[fact].theme ? [...THEMES] : ["any"];
function widthsFor(fact: FactKind, c: Component, state?: string): (Width | "any")[] {
  const overflow =
    fact === "behaviour" && (OVERFLOW_STATES as readonly string[]).includes(state ?? "");
  if (!VARIES[fact].width && !overflow) return ["any"];
  // The Builder previews App Home and modals at desktop width only (coverage.ts).
  return c.surfaces.includes("message") ? [...WIDTHS] : ["desktop"];
}

const REACTIVE = new Set<StateId>([
  "hover",
  "focus-visible",
  "pressed",
  "open",
  "toggled",
  "selected",
  "loading",
]);

/** The fact kinds a component has, and for each the states (or payload events) it's about. */
export function cellsOf(c: Component): CellKey[] {
  const cells: CellKey[] = [];
  // At rest, only something that reacts has behaviour or transitions to record.
  const reacts = c.states.some((s) => REACTIVE.has(s));
  for (const fact of c.facts ?? FACT_KINDS) {
    const states: (StateId | PayloadEvent)[] =
      fact === "payload"
        ? (c.events ?? [])
        : c.states.filter(
            (s) =>
              FACT_STATES[fact].includes(s) && (s !== "default" || fact === "styles" || reacts),
          );
    for (const state of states)
      for (const theme of themesFor(fact))
        for (const width of widthsFor(fact, c, state))
          cells.push({ component: c.id, state, theme, width, fact });
  }
  return cells;
}

const key = (c: Pick<Cell, "component" | "state" | "theme" | "width" | "fact">) =>
  `${c.component}|${c.state}|${c.theme}|${c.width}|${c.fact}`;

/** What each fact kind's evidence is, cell by cell. */
function evidence(components: Component[], sources: Sources, hits: Map<string, Hit[]>) {
  const found = new Map<string, Set<string>>();
  const add = (
    cell: Pick<Cell, "component" | "state" | "theme" | "width" | "fact">,
    what: string,
  ) => {
    const k = key(cell);
    if (!found.has(k)) found.set(k, new Set());
    found.get(k)!.add(what);
  };
  const openers = new Map(
    [...sources.payloads].map(([name, payload]) => [name, firstOpener(payload)]),
  );

  // References: styles in the state, theme and width they show; motion recorded in their meta.
  for (const [name, { motion, ...meta }] of sources.references) {
    const { fixture, interaction, theme, mobile, full } = parseReferenceName(name);
    const width: Width = mobile ? "mobile" : "desktop";
    const tags = [
      `reference ${name}`,
      ...(sources.baseline.has(name) ? [] : ["(not in the pixel baseline)"]),
      ...((sources.textFindings.get(name) ?? 0) > 0
        ? [`(${sources.textFindings.get(name)} text-run findings)`]
        : []),
    ].join(" ");
    // A `+full` reference and the captures captures.ts reads show only what it says they show.
    const plain =
      !full &&
      !(
        interaction &&
        (capturedElsewhere(fixture, interaction, sources.probes) ||
          sources.snapshots?.has(`${fixture}@${interaction}`))
      );
    for (const c of plain ? components : []) {
      const states = referenceStates(
        interaction,
        c,
        hits.get(c.id)!,
        fixture,
        openers.get(fixture),
      );
      for (const state of states) {
        if (!c.states.includes(state)) continue;
        add({ component: c.id, state, theme, width, fact: "styles" }, tags);
        if (motion && FACT_STATES.motion.includes(state))
          add(
            { component: c.id, state, theme: "any", width: "any", fact: "motion" },
            `motion in ${name}`,
          );
      }
    }
    for (const { what, ...cell } of referenceEvidence(
      name,
      sources.payloads.get(fixture),
      components,
      meta,
      sources.snapshots?.get(`${fixture}@${interaction}`),
    ))
      add(cell, what);
  }

  // Behaviour recordings: what Slack did when the probe's controls were driven.
  for (const [name, recording] of sources.behaviour ?? [])
    for (const { what, ...cell } of behaviourEvidence(
      name,
      sources.payloads.get(parseReferenceName(name).fixture),
      components,
      recording,
    ))
      add(cell, what);

  // Payload recordings: the action types they hold.
  for (const [name, recording] of sources.recordings) {
    const r = recording as { type?: string; actions?: { type?: string }[] };
    const event = (r.type ?? "block_actions") as PayloadEvent;
    for (const action of r.actions ?? []) {
      const c = components.find((x) => x.kind === "element" && x.id === action.type);
      if (c)
        add(
          { component: c.id, state: event, theme: "any", width: "any", fact: "payload" },
          `recording ${name}`,
        );
    }
    // An action from an input block with dispatch_action is the dispatch configuration's payload.
    const fixturePayload = sources.payloads.get(payloadName(name));
    if (
      event === "block_actions" &&
      (r.actions ?? []).length > 0 &&
      [...objects(fixturePayload)].some(([o]) => o.dispatch_action === true)
    )
      add(
        {
          component: "dispatch_action_config",
          state: event,
          theme: "any",
          width: "any",
          fact: "payload",
        },
        `recording ${name}`,
      );
    // A view_submission holds every input's value in state.values, keyed by block and action.
    if (event === "view_submission") {
      const values =
        (recording as { view?: { state?: { values?: Obj } } }).view?.state?.values ?? {};
      for (const block of Object.values(values) as Obj[])
        for (const value of Object.values(block ?? {}) as Obj[]) {
          const c = components.find((x) => x.kind === "element" && x.id === value?.type);
          if (c?.events?.includes(event))
            add(
              { component: c.id, state: event, theme: "any", width: "any", fact: "payload" },
              `recording ${name}`,
            );
        }
    }
    if (event !== "block_actions")
      for (const c of components.filter((x) => x.events?.includes(event) && x.kind === "chrome"))
        add(
          { component: c.id, state: event, theme: "any", width: "any", fact: "payload" },
          `recording ${name}`,
        );
  }

  // Interaction tests: facts asserted against Slack's values.
  for (const [title, groups] of Object.entries(sources.interactionTests))
    for (const g of groups)
      for (const id of g.components) {
        const c = components.find((x) => x.id === id);
        if (!c) throw new Error(`interaction test "${title}" names unknown component ${id}`);
        for (const fact of g.facts)
          for (const state of g.states) {
            if (!c.states.includes(state)) continue;
            const themes = VARIES[fact].theme ? (g.themes ?? ["light"]) : ["any" as const];
            const widths = VARIES[fact].width ? (g.widths ?? ["desktop"]) : ["any" as const];
            for (const theme of themes)
              for (const width of widths)
                add({ component: id, state, theme, width, fact }, `interaction test "${title}"`);
          }
      }
  return found;
}

/** The interaction a disclosure's other position is captured with (states.ts STATES names). */
export const TOGGLE: Record<string, string> = {
  container: "collapsed",
  plan: "expanded",
  task_card: "expanded",
  image: "hidden",
  data_table: "sort-asc",
  carousel: "scrolled",
  section: "expanded",
  "show-more": "expanded",
};
/** Components with a menu a click opens, besides the controls `@open` opens. */
export const MENUS = new Set(["image", "data_table", "data_visualization"]);

/**
 * The fixture-specific interaction that reaches an open, toggled or selected state with one real
 * click, or undefined when there's none (the state needs a hover first, or isn't a click's).
 */
export function fixtureInteraction(c: Component, state: StateId): string | undefined {
  if (state === "toggled") return TOGGLE[c.id];
  if (state === "selected")
    return /select$|picker$|^(checkboxes|radio_buttons|overflow|feedback_buttons|select-dialog)$/.test(
      c.id,
    )
      ? "pick"
      : undefined;
  if (state === "open") return MENUS.has(c.id) ? "menu" : undefined;
  // A chart's disabled Copy as image item shows in its open menu.
  if (state === "disabled" && c.id === "data_visualization") return "menu";
  return undefined;
}

const INTERACTION_STATES = new Set<StateId>(["hover", "focus-visible", "pressed"]);
const PAYLOAD_DRIVEN = new Set<StateId>([
  "default",
  "empty",
  "initial-value",
  "long-content",
  "many-items",
  "mixed",
  "disabled",
]);

/** How an uncovered cell can be captured (see Capture). */
export function classify(
  c: Component,
  cell: Pick<Cell, "state" | "fact" | "theme" | "width">,
  hits: Hit[],
  rules = 0,
): Capture {
  let capture = classifyCell(c, cell, hits);
  // The Builder's theme toggle and its Desktop/Mobile select are independent (checked in the
  // Builder), so +mobile+dark is an ordinary reference; verify the first capture follows dark.
  if (
    capture.method === "a" &&
    cell.fact === "styles" &&
    cell.theme === "dark" &&
    cell.width === "mobile"
  )
    capture = {
      ...capture,
      how: `${capture.how}; the first +mobile+dark capture should confirm the Mobile preview follows the dark theme`,
      verify: true,
    };
  if (c.id === "slack_file" && capture.method === "a")
    capture = {
      ...capture,
      how: `${capture.how}; needs the maintainer's capture.local.json file substitute`,
    };
  return rules > 0 && capture.method === "b"
    ? { ...capture, how: `${capture.how} (${rules} Builder stylesheet rules style it)` }
    : capture;
}

function classifyCell(
  c: Component,
  cell: Pick<Cell, "state" | "fact" | "theme" | "width">,
  hits: Hit[],
): Capture {
  const { state, fact } = cell;
  const reason = c.unobservable?.[state] ?? c.unobservable?.[fact];
  const shown =
    state in STATE_WEIGHT && PAYLOAD_DRIVEN.has(state as StateId)
      ? hits.some((h) => showsState(c.id, h, state as StateId))
      : hits.length > 0;
  const needsFixture = !shown;
  // Horizontal overflow: the harness's unclipped (`+full`) and `@scrolled-end` captures.
  if (state === "full-content" && !reason)
    return {
      method: "b",
      capability: "unclipped",
      how: "Capture the block unclipped (`+full`): its whole width, as if the preview were wide enough",
      needsFixture,
    };
  if (state === "scrolled-end" && !reason)
    return {
      method: "b",
      capability: "scrolled-end",
      how:
        fact === "behaviour"
          ? "Record whether the block scrolls sideways at this width, its minimum width and its scroll range (`@scrolled-end`)"
          : "Scroll the block sideways to its end, then snapshot (`@scrolled-end`)",
      needsFixture,
    };
  if (reason)
    return {
      method: "c",
      capability: "unobservable",
      how: reason,
      needsFixture,
      verify: /verify/.test(reason),
    };

  if (fact === "payload") {
    if (state === "block_actions")
      return {
        method: "a",
        capability: "actions-preview",
        how: "Perform it in the Builder and copy Actions Preview (README: Action payloads)",
        needsFixture,
      };
    return {
      method: "a",
      capability: "actions-preview",
      how: `Submit or close the modal preview and copy Actions Preview's ${state}`,
      needsFixture,
      verify: true,
    };
  }
  if (fact === "behaviour")
    return state === "validation-error"
      ? {
          method: "b",
          capability: "validation-probe",
          how: "Submit the modal preview with the field empty or invalid and record what Slack shows and where focus goes",
          needsFixture,
          verify: true,
        }
      : {
          method: "b",
          capability: "behaviour-probe",
          how: "Drive the control with real keys and pointer events and record focus, open/close and scroll (behaviour probe)",
          needsFixture,
        };
  if (fact === "motion") {
    if (state === "default")
      return {
        method: "a",
        capability: "reference",
        how: "Any new reference records the declared transitions in its meta",
        needsFixture,
      };
    return {
      method: "b",
      capability: "css-rules",
      how: "Read the @keyframes and animation declarations of the opened or toggled element from the Builder's stylesheets",
      needsFixture,
    };
  }
  // Styles.
  if (INTERACTION_STATES.has(state as StateId))
    return {
      method: "b",
      capability: "real-input",
      how: `Hold ${state} with real input (CDP) and snapshot, or derive it from the :${state === "pressed" ? "active" : state === "hover" ? "hover" : "focus-visible"} rules`,
      needsFixture,
    };
  if (state === "validation-error")
    return {
      method: "b",
      capability: "validation-probe",
      how: "Submit the modal preview with the field invalid, then snapshot",
      needsFixture,
      verify: true,
    };
  if (state === "loading")
    return {
      method: "b",
      capability: "css-rules",
      how: "Read the loading styles and spinner keyframes from the stylesheets",
      needsFixture,
    };
  if (state === "open" && c.id === "confirm")
    return { method: "a", capability: "reference", how: "@confirm", needsFixture };
  if (state === "open" && c.id === "select-dialog")
    return { method: "a", capability: "reference", how: "@dialog", needsFixture };
  if (state === "open" && OPENS.test(c.id))
    return {
      method: "a",
      capability: "reference",
      how: "@open (make it the fixture's first control that opens)",
      needsFixture,
    };
  const interaction = fixtureInteraction(c, state as StateId);
  if (interaction)
    return {
      method: "a",
      capability: "fixture-state",
      how: `A fixture-specific @${interaction} state: capture.js waits for a real click (add it to states.ts)`,
      needsFixture,
    };
  if (state === "open" || state === "toggled" || state === "selected")
    return {
      method: "b",
      capability: "real-input",
      how: `No click reaches it on its own: hold the input that leads there (hover, then click), then snapshot`,
      needsFixture,
    };
  return {
    method: "a",
    capability: "reference",
    how: `Plain reference${cell.width === "mobile" ? " +mobile" : ""}${cell.theme === "dark" ? " +dark" : ""}`,
    needsFixture,
  };
}

/**
 * Block Kit can't disable an element, so Slack's disabled styles (from its shared form controls)
 * never show in a Block Kit surface. The exceptions are disabled states Block Kit itself has: a
 * modal's `submit_disabled` and a chart menu's Copy as image item.
 */
const DISABLED_APPLIES = new Set(["modal-frame", "data_visualization"]);
export const NOT_APPLICABLE_DISABLED = "Block Kit can't disable elements (maintainer decision)";

export function notApplicable(component: Component, state: Cell["state"]): string | undefined {
  if (state === "disabled" && !DISABLED_APPLIES.has(component.id)) return NOT_APPLICABLE_DISABLED;
  return component.na?.[state as StateId];
}

/**
 * What the verification session showed Block Kit Builder never renders, so no capture of it
 * records Slack's fact: only the real Slack client does.
 */
export const BUILDER_NEVER = {
  validation:
    "Block Kit Builder doesn't validate a modal: Submit sends view_submission with required fields empty and shows no errors (verification session); only the real Slack client does",
  toolbar:
    "Block Kit Builder draws no message hover toolbar and no hover background (verification session); only the real Slack client does",
  loading:
    "Block Kit Builder has no app behind it, so nothing waits on a response and no loading state shows; only the real Slack client does",
  externalOpen:
    "An external select has no options in Block Kit Builder (no options load URL), so its list has nothing to open (light desktop chunks; verify with the harness)",
  legacyFields:
    'Block Kit Builder shows "This content could not be displayed." for a legacy attachment\'s pretext, author, title, text and fields (light desktop chunks)',
  workflow:
    "Block Kit Builder refuses a workflow_button whose trigger isn't a real workflow's (light desktop chunks; verify)",
  showMore:
    "Block Kit Builder shows no section Show more (a 980-character section renders in full, verification session); extra/fidelity/section/long-content checks the 3,000-character limit (verify), otherwise only the real Slack client",
};

export function unobservableInBuilder(c: Component, state: Cell["state"]): string | undefined {
  if (state === "open" && (c.id === "external_select" || c.id === "multi_external_select"))
    return BUILDER_NEVER.externalOpen;
  if (c.id === "message-attachments" && state === "mixed") return BUILDER_NEVER.legacyFields;
  if (c.id === "workflow_button") return BUILDER_NEVER.workflow;
  if (state === "validation-error") return BUILDER_NEVER.validation;
  if (state === "loading") return BUILDER_NEVER.loading;
  if (c.id === "message-actions") return BUILDER_NEVER.toolbar;
  if (c.id === "show-more" || (c.id === "section" && state === "toggled"))
    return BUILDER_NEVER.showMore;
  return undefined;
}

/** Cells that don't apply at a width: a surface variant on a surface without a mobile preview. */
/** Blocks Slack lays out within the 512px desktop preview: nothing scrolls sideways there. */
const FITS_DESKTOP = new Set([
  "data_visualization",
  "table",
  "data_table",
  "markdown",
  "rich_text.rich_text_preformatted",
]);

function notApplicableAt(component: Component, cell: CellKey): string | undefined {
  if (
    (cell.state === "scrolled-end" || cell.state === "full-content") &&
    cell.width === "desktop" &&
    FITS_DESKTOP.has(component.id)
  )
    return "At the desktop width Slack doesn't overflow this block (512px preview): nothing to scroll or unclip (light desktop chunks)";
  if (cell.state === "validation-error" && cell.width === "mobile")
    return "Only a modal's submit validates, and Block Kit Builder previews modals at desktop width only";
  if (
    cell.state === "mixed" &&
    cell.width === "mobile" &&
    component.variantSurface &&
    component.variantSurface !== "message" &&
    !component.states.includes("mixed")
  )
    return `Its only variant is the ${component.variantSurface} one, which the Builder previews at desktop width`;
  return undefined;
}

/** Adds the states Builder's stylesheets reveal to each component's own. */
export function withDiscoveredStates(components: Component[], discovery: Discovery): Component[] {
  return components.map((c) => {
    const found = discovery.byComponent.get(c.id);
    if (!found) return c;
    const extra = [...found.keys()].filter((st) => !c.states.includes(st));
    return extra.length > 0 ? { ...c, states: [...c.states, ...extra] } : c;
  });
}

/** How many stylesheet rules speak to a cell: styles and motion by what the rules set. */
function rulesFor(d: Discovered | undefined, cell: Pick<Cell, "fact" | "width">): number {
  if (!d) return 0;
  if (cell.fact === "payload") return 0;
  if (cell.fact === "styles" && !d.facts.has("styles")) return 0;
  if (cell.fact === "motion" && !d.facts.has("motion")) return 0;
  return d.rules;
}

export interface Inventory {
  components: ComponentReport[];
  cells: Cell[];
  /** What Block Kit Builder's stylesheets added, when they were given. */
  stylesheet?: {
    rules: Discovery["rules"];
    /** States only the stylesheets revealed, per component. */
    added: { component: string; states: StateId[] }[];
    families: FamilyReport[];
  };
  gaps: {
    /** In Slack's reference or Builder catalog, not rendered by the package. */
    notImplemented: string[];
    /** Rendered by the package, in no fixture. */
    noFixture: string[];
    /** Fixtures whose expected references (coverage.ts) are missing, as a count. */
    missingExpectedReferences: number;
  };
}

export function buildInventory(curated: Component[], sources: Sources): Inventory {
  const discovery = sources.stylesheet
    ? discover(sources.stylesheet, new Set(curated.map((c) => c.id)))
    : undefined;
  const components = discovery ? withDiscoveredStates(curated, discovery) : curated;
  const hits = findComponents(components, sources.payloads);
  const found = evidence(components, sources, hits);
  const isImplemented = (c: Component) =>
    !c.impl
      ? false
      : "registry" in c.impl
        ? sources.implemented[c.impl.registry].has(c.impl.type)
        : sources.files.has(c.impl.file);

  const cells: Cell[] = [];
  const curatedOf = (id: string) => curated.find((x) => x.id === id)!;
  for (const c of components) {
    const curatedStates = curatedOf(c.id).states;
    for (const cell of cellsOf(c)) {
      const all = [...(found.get(key(cell)) ?? [])].toSorted();
      const value = (4 - c.tier) * STATE_WEIGHT[cell.state];
      const na = notApplicable(c, cell.state) ?? notApplicableAt(curatedOf(c.id), cell);
      const rules = rulesFor(discovery?.byComponent.get(c.id)?.get(cell.state as StateId), cell);
      // Facts Block Kit Builder can't show: a capture of it doesn't record Slack's fact (an
      // interaction test, whose values come from Slack's stylesheet, still does).
      const builderCant =
        cell.fact === "payload" ? undefined : unobservableInBuilder(c, cell.state);
      const ev = builderCant ? all.filter((e) => e.startsWith("interaction test")) : all;
      cells.push({
        ...cell,
        covered: ev.length > 0,
        evidence: ev,
        value,
        origin:
          (curatedStates as string[]).includes(cell.state) || cell.fact === "payload"
            ? "curated"
            : "builder-css",
        ...(rules ? { rules } : {}),
        ...(na
          ? { na }
          : builderCant && ev.length === 0
            ? {
                capture: {
                  method: "c" as const,
                  capability: "unobservable" as const,
                  how: builderCant,
                  needsFixture: false,
                },
              }
            : ev.length > 0
              ? {}
              : { capture: classify(c, cell, hits.get(c.id)!, rules) }),
      });
    }
  }

  const reports: ComponentReport[] = components.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    source: c.source,
    docs: c.docs ? DOCS + c.docs : undefined,
    surfaces: c.surfaces,
    tier: c.tier,
    implemented: isImplemented(c),
    fixtures: [...new Set(hits.get(c.id)!.map((h) => h.fixture))].toSorted(),
    notes: c.notes,
  }));

  let missingExpectedReferences = 0;
  for (const [name, payload] of sources.payloads)
    for (const s of expectedStates(payload))
      if (!sources.references.has(name + s)) missingExpectedReferences++;

  return {
    components: reports,
    cells,
    ...(discovery
      ? {
          stylesheet: {
            rules: discovery.rules,
            added: components
              .map((c) => ({
                component: c.id,
                states: c.states.filter(
                  (st) => !curated.find((x) => x.id === c.id)!.states.includes(st),
                ),
              }))
              .filter((a) => a.states.length > 0),
            families: discovery.families,
          },
        }
      : {}),
    gaps: {
      notImplemented: reports.filter((r) => !r.implemented).map((r) => r.id),
      noFixture: reports
        .filter((r) => r.implemented && r.fixtures.length === 0)
        .filter((r) => !components.find((c) => c.id === r.id)!.unobservable?.styles)
        .map((r) => r.id),
      missingExpectedReferences,
    },
  };
}

// Summaries

export interface Tally {
  total: number;
  covered: number;
  pct: number;
}
const tally = (cells: Cell[]): Tally => {
  const covered = cells.filter((c) => c.covered).length;
  return {
    total: cells.length,
    covered,
    pct: cells.length ? Math.round((covered / cells.length) * 1000) / 10 : 100,
  };
};
const groupBy = <T>(items: T[], by: (t: T) => string) => {
  const m = new Map<string, T[]>();
  for (const i of items) {
    const k = by(i);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(i);
  }
  return m;
};
const tallies = (cells: Cell[], by: (c: Cell) => string) =>
  Object.fromEntries([...groupBy(cells, by)].map(([k, v]) => [k, tally(v)]));

export interface Batch {
  id: string;
  method: Capture["method"];
  capability: Capture["capability"];
  /** Whether the batch's cells wait on new fixture payloads. */
  newFixtures: boolean;
  surface: Surface;
  theme: Theme | "any";
  cells: number;
  needsFixture: number;
  value: number;
  components: string[];
}

/**
 * Uncovered cells grouped into work that can be done in one Builder session: the same capture
 * capability, surface and theme (capture.js switches width per item, so widths share a batch).
 * Ordered by the value of the cells they cover.
 */
export function batches(inventory: Inventory, components: Component[]): Batch[] {
  const reports = new Map(inventory.components.map((r) => [r.id, r]));
  const open = inventory.cells.filter((c) => !c.covered && c.capture && c.capture.method !== "c");
  const groups = groupBy(open, (c) =>
    [
      c.capture!.method,
      c.capture!.capability,
      c.capture!.needsFixture ? "new" : "existing",
      captureSurface(c, reports.get(c.component)!),
      c.theme,
    ].join(":"),
  );
  const tierOf = new Map(components.map((c) => [c.id, c.tier]));
  return [...groups]
    .map(([id, cells]): Batch => {
      const [method, capability, fixtures, surface, theme] = id.split(":") as [
        Capture["method"],
        Capture["capability"],
        string,
        Surface,
        Theme | "any",
      ];
      return {
        id,
        method,
        capability,
        newFixtures: fixtures === "new",
        surface,
        theme,
        cells: cells.length,
        needsFixture: cells.filter((c) => c.capture!.needsFixture).length,
        value: cells.reduce((n, c) => n + c.value, 0),
        components: [...new Set(cells.map((c) => c.component))].toSorted(
          (a, b) => tierOf.get(a)! - tierOf.get(b)! || a.localeCompare(b),
        ),
      };
    })
    .toSorted((a, b) => Number(a.newFixtures) - Number(b.newFixtures) || b.value - a.value);
}

/**
 * The surface a cell is captured on: a modal for validation and view payloads, otherwise a message
 * when the component goes in one (the Builder's default, with the mobile width), else its own.
 */
export function captureSurface(cell: Cell, report: ComponentReport): Surface {
  const modal =
    cell.state === "validation-error" ||
    cell.state === "view_submission" ||
    cell.state === "view_closed";
  if (modal && report.surfaces.includes("modal")) return "modal";
  return report.surfaces.includes("message") ? "message" : report.surfaces[0]!;
}

export function summarize(inventory: Inventory) {
  const cells = inventory.cells.filter((c) => !c.na);
  const uncovered = cells.filter((c) => !c.covered);
  return {
    notApplicable: inventory.cells.length - cells.length,
    total: tally(cells),
    byFact: tallies(cells, (c) => c.fact),
    byState: tallies(cells, (c) => String(c.state)),
    byTheme: tallies(cells, (c) => c.theme),
    byWidth: tallies(cells, (c) => c.width),
    byKind: tallies(cells, (c) => inventory.components.find((r) => r.id === c.component)!.kind),
    byComponent: tallies(cells, (c) => c.component),
    uncoveredByMethod: Object.fromEntries(
      [...groupBy(uncovered, (c) => c.capture?.method ?? "?")].map(([k, v]) => [k, v.length]),
    ),
    uncoveredByCapability: Object.fromEntries(
      [...groupBy(uncovered, (c) => c.capture?.capability ?? "?")].map(([k, v]) => [k, v.length]),
    ),
    needsFixture: uncovered.filter((c) => c.capture?.needsFixture).length,
  };
}
