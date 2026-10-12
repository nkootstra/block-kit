/**
 * The capture plan: every capture the harness can make that covers an uncovered inventory cell,
 * as exact items for capture.js, grouped into one Block Kit Builder session per surface, theme and
 * width; and, for cells no fixture can show yet, a proposed fixture payload for each.
 *
 * Items are reference names (names.ts) on existing fixtures, of every kind: plain references,
 * `@open`, `@confirm`, `@dialog` and fixture-specific states, `+full` and `@scrolled-end`, real
 * input held (`@hover-<target>`, `@focus-<target>`), `@submit-errors`, and behaviour probes
 * (`<fixture>@<probe>`, probes.ts), which also record the Actions Preview payload. A plain capture
 * also records its controls' state styles and its scroll containers (snapshot.js), so it covers
 * hover, pressed and focus styles too. One capture covers every cell it shows, so items are chosen
 * greedily: the one covering the most valuable uncovered cells first. Within a session, the items
 * capture.js performs itself come first, then those that need real input.
 */
import { expectedStates, objects } from "../coverage";
import { formatReferenceName, parseReferenceName } from "../names";
import { type Probe, probeSnapshots, type Step } from "../probes";
import { STATES } from "../states";
import { KINDS, LAYER_KINDS, parseTarget, UNFOCUSABLE, UNVERIFIED } from "../targets";
import {
  type FactKind,
  type PayloadEvent,
  STATES as STATE_IDS,
  type StateId,
  type Surface,
  type Theme,
  type Width,
} from "./axes";
import {
  behaviourEvidence,
  controlComponents,
  controlNodes,
  referenceEvidence,
  revealedBy,
} from "./captures";
import { type Component, surfaceOf } from "./components";
import {
  type Cell,
  firstOpener,
  fixtureInteraction,
  type Inventory,
  fidelityDir,
  showsState,
} from "./inventory";

type Obj = Record<string, unknown>;

/** How many items capture.js gets per paste, so a long session can resume between batches. */
export const SESSION_SIZE = 25;

/** States capture.js performs itself (states.ts OPEN_STATES); any other waits for a real click. */
const AUTOMATIC = new Set(["open", "confirm", "dialog"]);
const PAYLOAD_STATES = new Set<StateId>([
  "default",
  "empty",
  "initial-value",
  "long-content",
  "many-items",
  "mixed",
]);

/**
 * - `rest`: a plain reference (it also records state styles and scroll containers).
 * - `open`, `confirm`, `dialog`: performed by capture.js on the first control of the kind.
 * - `fixture-state`: a fixture-specific interaction a real click performs (`@pick`, `@expanded`).
 * - `full`, `scrolled-end`: wide content unclipped, or scrolled to its end.
 * - `hover`, `focus`: real input held on a control while the snapshot is taken.
 * - `submit-errors`: a modal's submit pressed with its fields as the payload leaves them.
 * - `probe`: a behaviour probe's steps, recorded (and its payload, when it sends one).
 */
export type ItemKind =
  | "rest"
  | "open"
  | "confirm"
  | "dialog"
  | "fixture-state"
  | "full"
  | "scrolled-end"
  | "hover"
  | "focus"
  | "submit-errors"
  | "probe";

/** Kinds that need real input from whoever drives the Builder. */
const REAL_INPUT = new Set<ItemKind>(["hover", "focus", "submit-errors", "probe", "fixture-state"]);

export interface PlanItem {
  /** The reference (or, for a probe, recording) name to pass to capture.js. */
  name: string;
  kind: ItemKind;
  fixture: string;
  path: string;
  /** A probe's spec, next to its fixture. */
  probe?: string;
  surface: Surface;
  theme: Theme;
  width: Width;
  interaction?: string;
  /** The item needs real input: a held pointer or focus, a probe's steps, or a real click. */
  realInput: boolean;
  /** capture.js can't perform the interaction itself: it waits for a real click (sbkCaptureReady). */
  manual: boolean;
  /** compare.ts can't replay it until states.ts has an entry for it. */
  needsStateEntry: boolean;
  /** The name already has a reference, captured before it recorded state styles: a recapture. */
  recapture?: boolean;
  /**
   * A probe run in another theme or width than the light desktop its recording belongs to: it only
   * takes its snapshots, and records no behaviour or payload.
   */
  snapshotOnly?: boolean;
  /** coverage:visual already expects this reference (coverage.ts). */
  expected?: boolean;
  cells: number;
  value: number;
  covers: string[];
}

export interface Session {
  id: string;
  surface: Surface;
  theme: Theme;
  width: Width;
  /** Items capture.js performs itself, most valuable first. */
  automatic: PlanItem[];
  /** Items that need real input, most valuable first. */
  realInput: PlanItem[];
  /**
   * The session in runs of at most SESSION_SIZE items, to capture and import one at a time:
   * `<session>#a01`… for the automatic items, then `<session>#r01`… for real input.
   */
  chunks: { id: string; realInput: boolean; items: string[] }[];
  cells: number;
  value: number;
}

export interface Proposal {
  /** Proposed fixture path, relative to the repository. */
  path: string;
  component: string;
  states: string[];
  /** Why no existing fixture can be used. */
  reason: string;
  payload?: unknown;
  /** The payload is a starting point: fields the docs require are still to be filled in. */
  incomplete?: string;
  /** References to capture once the fixture exists. */
  names: string[];
  cells: number;
  value: number;
}

export interface ProbeProposal {
  /** `<fixture>@<probe>`; the spec goes to `fixtures/<name>.probe.json`. */
  name: string;
  probe: Probe;
  /** The behaviour cells it's expected to record (component and state). */
  covers: string[];
}

/** Uncovered cells no capture kind reaches yet, grouped by why. */
export interface Unplanned {
  reason: string;
  cells: number;
  components: string[];
}

export interface CapturePlan {
  sessions: Session[];
  /** Items whose fixture shows a real workspace file: only the maintainer can capture them. */
  maintainer: PlanItem[];
  /** Items left out because Block Kit Builder can't capture their fixture (NOT_CAPTURABLE). */
  skipped: { name: string; reason: string }[];
  proposals: Proposal[];
  /** Probe specs no fixture has yet, for behaviour cells no probe reaches: write them, then re-plan. */
  probeProposals: ProbeProposal[];
  unplanned: Unplanned[];
  totals: {
    items: number;
    realInputItems: number;
    maintainerItems: number;
    manualItems: number;
    /** Items coverage:visual already expects and doesn't find. */
    expectedItems: number;
    probes: number;
    sessions: number;
    cellsCovered: number;
    cellsWithoutFixture: number;
    cellsUnplanned: number;
    proposals: number;
  };
}

/**
 * Fixtures Block Kit Builder can't capture usefully: nothing of them goes in a session.
 */
export const NOT_CAPTURABLE: Record<string, string> = {
  "extra/fidelity/message-attachments/mixed":
    'Block Kit Builder shows "This content could not be displayed." for a legacy attachment\'s fields',
  "extra/fidelity/workflow-button/mixed":
    "Block Kit Builder refuses a workflow_button whose trigger isn't a real workflow's",
  "extra/actions/workflow-button.unverified":
    "Block Kit Builder refuses a workflow_button whose trigger isn't a real workflow's",
};

/** The placeholder a fixture names a real workspace file by (samples.ts, capture.local.json). */
const FILE_PLACEHOLDER = "files.slack.com/files-pri/T0000001-F0000001";

/** Whether a fixture shows a real workspace file, which needs the maintainer's substitute. */
export function needsFileSubstitute(payload: unknown): boolean {
  return [...objects(payload)].some(
    ([o]) =>
      "slack_file" in o ||
      Object.values(o).some((v) => typeof v === "string" && v.includes(FILE_PLACEHOLDER)),
  );
}

const cellKey = (c: Cell) => `${c.component}|${c.state}|${c.theme}|${c.width}|${c.fact}`;

/** The first button and the first section accessory in a payload, in document order. */
function firsts(payload: unknown) {
  let button: Obj | undefined;
  let accessory: Obj | undefined;
  for (const [o, key] of objects(payload)) {
    if (!button && o.type === "button") button = o;
    if (!accessory && key === "accessory" && String(o.type).endsWith("select")) accessory = o;
  }
  return { button, accessory };
}

interface Candidate {
  fixture: string;
  kind: ItemKind;
  interaction?: string;
  full?: boolean;
  /** Overrides the cell's theme and width (a probe records in light, at desktop width). */
  theme?: Theme;
  width?: Width;
}

type Where = Map<string, { payload: unknown; surface: Surface; nodes: Obj[] }>;

/** What a probe is expected to record: the evidence behaviourEvidence and the payload loop give. */
export interface ProbeForecast {
  behaviour: { component: string; state: StateId }[];
  payload: { component: string; event: PayloadEvent }[];
}

const clicked = (steps: Step[]) =>
  steps.flatMap((s) => ("click" in s && typeof s.click === "string" ? [s.click] : []));

/**
 * What a probe will show once recorded: a click on a field or an overflow menu opens a layer; a
 * pick (Enter or Space after opening, a checkbox or radio, a button, an option by role) sends
 * block_actions; a click on a modal's submit sends view_submission, on its cancel view_closed.
 */
export function forecastProbe(
  name: string,
  probe: Probe,
  payload: unknown,
  components: Component[],
): ProbeForecast {
  const addresses = clicked(probe.steps);
  const kinds = addresses.map((a) => parseTarget(a)?.kind);
  const OPENERS = new Set(["field", "overflow", "menu"]);
  const opens = kinds.some((k) => k !== undefined && OPENERS.has(k));
  const keys = probe.steps.flatMap((s) => ("key" in s ? [s.key] : []));
  const LAYER_PICKS = new Set(["option", "menuitem", "confirm"]);
  const picks =
    kinds.some(
      (k) =>
        k === "checkbox" ||
        k === "radio" ||
        k === "button" ||
        (k !== undefined && LAYER_PICKS.has(k)),
    ) ||
    probe.steps.some((s) => "click" in s && typeof s.click === "object") ||
    (opens && keys.some((k) => k === "Enter" || k === "Space")) ||
    keys.includes("Space");
  // Enough arrow presses in an open list scroll it.
  const scrolls = opens && keys.filter((k) => k === "ArrowDown").length >= 8;
  // A Show more, a column header, a pagination button or a carousel arrow changes its own state.
  const TOGGLES = new Set([
    "more",
    "column",
    "page",
    "arrow",
    "collapse",
    "pill",
    "task",
    "expand",
  ]);
  const toggled = addresses.filter((a) => TOGGLES.has(parseTarget(a)?.kind ?? ""));
  // A scroll step, or a carousel arrow, moves a block's scroller off 0.
  const scrollers = [
    ...probe.steps.flatMap((s) =>
      "scroll" in s && typeof s.scroll === "string" ? [s.scroll] : [],
    ),
    ...(addresses.some((a) => parseTarget(a)?.kind === "arrow") ? ["scroller-1"] : []),
  ];
  const observation = (step: number) => ({
    focus: null,
    layers:
      opens && step > 0
        ? [{ kind: "popover" as const, role: null, scrollTop: scrolls ? 1 : 0 }]
        : [],
    activeOption: null,
    controls: Object.fromEntries([
      ...toggled.map((a) => [a, { expanded: String(step > 0) }]),
      ...scrollers.map((a) => [
        a,
        { scrollLeft: step > 0 ? 100 : 0, scrollTop: 0, scrollWidth: 800, clientWidth: 400 },
      ]),
    ]),
    ...(picks && step > 0 ? { action: {} } : {}),
  });
  const behaviour = behaviourEvidence(name, payload, components, {
    steps: probe.steps,
    observations: [observation(0), observation(1)],
  }).map(({ component, state }) => ({ component, state }));
  const byAddress = controlComponents(payload);
  const targeted = new Set(
    addresses.flatMap((a) => {
      const t = parseTarget(a);
      const id = t && byAddress[t.kind]?.[t.index - 1];
      return id ? [id] : [];
    }),
  );
  // Block Kit Builder doesn't validate: a submit always sends view_submission, empty required
  // fields and all (verification session).
  const blocks = [...objects(payload)].filter(([o]) => o.type === "input").map(([o]) => o);
  const typed = probe.steps.some((s) => "type" in s);
  const dispatches = blocks.filter((b) => b.dispatch_action === true);
  const payloads: ProbeForecast["payload"] = [];
  if (typed && dispatches.length > 0 && !kinds.includes("submit")) {
    // Typing into a dispatch_action input (Enter, or each character) sends block_actions; with no
    // click, the element focused on load takes the typing.
    for (const b of dispatches) {
      const el = b.element as Obj;
      const type = String(el.type);
      if (targeted.has(type) || (addresses.length === 0 && el.focus_on_load === true))
        payloads.push({ component: type, event: "block_actions" });
    }
    if (payloads.length > 0)
      payloads.push({ component: "dispatch_action_config", event: "block_actions" });
  } else if (kinds.includes("submit")) {
    // state.values holds every input of the view, addressed or not.
    payloads.push({ component: "modal-frame", event: "view_submission" });
    const root = payload as Obj;
    for (const c of components)
      if (
        c.kind === "element" &&
        c.events?.includes("view_submission") &&
        [...objects(payload)].some(([o, k]) => c.match(o, k, root))
      )
        payloads.push({ component: c.id, event: "view_submission" });
  } else if (kinds.includes("cancel"))
    payloads.push({ component: "modal-frame", event: "view_closed" });
  else if (picks)
    for (const a of addresses) {
      const t = parseTarget(a);
      const id = t && byAddress[t.kind]?.[t.index - 1];
      if (id) payloads.push({ component: id, event: "block_actions" });
    }
  return { behaviour, payload: payloads };
}

/**
 * The control addresses of a component in a payload (targets.ts), in document order, as
 * captures.ts maps them: counted controls by index, and the kinds that belong to one component
 * (a table's columns, a carousel's arrows) wherever the fixture has it.
 */
export function addressesOf(
  payload: unknown,
  id: string,
  components: Component[],
  { layers = true }: { layers?: boolean } = {},
): string[] {
  const counted = controlComponents(payload);
  const out: string[] = [];
  for (const kind of KINDS) {
    if (!layers && LAYER_KINDS.includes(kind)) continue;
    const n = Math.max(1, counted[kind]?.length ?? 0);
    for (let i = 1; i <= n; i++) {
      const address = `${kind}-${i}`;
      const evidence = [
        ...referenceEvidence(`x@hover-${address}`, payload, components),
        ...referenceEvidence(`x@focus-${address}`, payload, components),
      ];
      if (evidence.some((e) => e.component === id)) out.push(address);
    }
  }
  return out;
}

/**
 * The focus a snapshot's meta will record (captures.ts ReferenceMeta.focus), forecast from the
 * steps before it: Tab after opening a confirm dialog moves focus to confirm, then deny;
 * ArrowLeft in a multi-select's field focuses its last chip. Arrow keys in an open list move the
 * highlight (aria-activedescendant) while focus stays on the field.
 */
export function forecastFocus(
  steps: Step[],
  payload: unknown,
): { target: string; visible: boolean; active?: string } | undefined {
  const last = steps.findLastIndex((s) => "click" in s || "hover" in s);
  const keys = steps.slice(last + 1).flatMap((s) => ("key" in s ? [s.key] : []));
  if (keys.length === 0) return undefined;
  let opened = last >= 0 && "click" in steps[last]! ? steps[last]!.click : undefined;
  // A selection dialog's field, clicked after the accessory that opened the dialog (openSteps):
  // the list it opens is that accessory's.
  if (typeof opened === "object" && opened.role === "combobox") {
    const accessory = steps
      .slice(0, last)
      .findLast((s) => "click" in s && typeof s.click === "string");
    if (accessory && "click" in accessory) opened = accessory.click;
  }
  const kind = typeof opened === "string" ? parseTarget(opened)?.kind : undefined;
  const tabs =
    keys.filter((k) => k === "Tab").length - keys.filter((k) => k === "Shift+Tab").length;
  if (kind === "button" && tabs > 0)
    return { target: tabs === 1 ? "confirm-1" : "deny-1", visible: true };
  if (keys.at(-1) === "ArrowLeft") {
    const chips = controlComponents(payload).chip?.length ?? 0;
    if (chips > 0) return { target: `chip-${chips}`, visible: true };
  }
  // Arrow keys in an open list or menu move its highlight (aria-activedescendant), from the first
  // item, while DOM focus stays on the control that opened it.
  const arrows =
    keys.filter((k) => k === "ArrowDown").length - keys.filter((k) => k === "ArrowUp").length;
  if (
    typeof opened === "string" &&
    arrows > 0 &&
    (kind === "field" || kind === "overflow" || kind === "menu")
  )
    return {
      target: opened,
      visible: true,
      active: `${kind === "field" ? "option" : "menuitem"}-${arrows}`,
    };
  if (typeof opened === "string") return { target: opened, visible: true };
  return undefined;
}

/**
 * The steps that open a control's layer: a click on it. A section accessory's multi-select opens
 * Slack's selection dialog instead, with its field at rest (the dialog takes the focus), so a click
 * on the dialog's field follows, which opens the list. The field is a combobox named after the
 * placeholder on both sides (Slack's aria-label, ours too).
 */
export function openSteps(payload: unknown, address: string): Step[] {
  const t = parseTarget(address);
  const c = t && controlNodes(payload)[t.kind]?.[t.index - 1];
  const placeholder = (c?.node.placeholder as Obj | undefined)?.text;
  if (
    c?.key === "accessory" &&
    String(c.node.type).startsWith("multi_") &&
    typeof placeholder === "string"
  )
    return [{ click: address }, { click: { role: "combobox", name: placeholder } }];
  return [{ click: address }];
}

/**
 * Kinds Block Kit Builder doesn't reliably draw for a fixture's placeholder IDs, so real input on
 * them can't be captured: a contact card for a user outside the workspace (U0123456789) rendered
 * in some captures and not in others (catalog/callout/callout has it on 7 and 8 October, not in
 * @focus-menu-1 on 12 October; extra/fidelity/contact-card/mixed shows one of its two), and a
 * live run found none within 5 s. Fidelity finding builder-contact-card.
 */
export const NOT_DRAWN = new Set<string>(["contact"]);

/**
 * The control a person sees at rest in place of `address`: a carousel's left arrow (arrow-1) is
 * drawn hidden (opacity 0 in Slack, disabled in ours) until the carousel has scrolled, so its
 * right arrow (arrow-2) is the one to hover, focus or click.
 */
export const shownAtRest = (address: string) => (address === "arrow-1" ? "arrow-2" : address);

/** The click that makes a control exist (a collapsed plan's or task card's pill), if it needs one. */
export function revealSteps(payload: unknown, address: string): Step[] {
  const pill = revealedBy(payload, address);
  return pill ? [{ click: pill }] : [];
}

/**
 * Whether the payload's first control that opens is a multi-select already holding a value: in
 * Block Kit Builder a click or ArrowDown on one with a chip doesn't open its list (light desktop
 * chunks, pending the harness's answer).
 */
function openerHasChips(payload: unknown): boolean {
  for (const [o] of objects(payload))
    if (
      typeof o.type === "string" &&
      /^(multi_)?(static|external|users|conversations|channels)_select$|^(datepicker|timepicker|datetimepicker|overflow)$/.test(
        o.type,
      )
    )
      return (
        o.type.startsWith("multi_") &&
        Object.keys(o).some(
          (k) => k.startsWith("initial_") && Array.isArray(o[k]) && (o[k] as unknown[]).length > 0,
        )
      );
  return false;
}

/** Plain-reference states (a, today's flow). */
function referenceCandidates(cell: Cell, component: Component, fixtures: Where): Candidate[] {
  const out: Candidate[] = [];
  const state = cell.state as StateId;
  for (const [fixture, f] of fixtures) {
    if (cell.width === "mobile" && f.surface !== "message") continue;
    if (cell.fact === "motion" || PAYLOAD_STATES.has(state)) {
      if (
        cell.fact === "motion" ||
        f.nodes.some((node) => showsState(component.id, { fixture, node }, state))
      )
        out.push({ fixture, kind: "rest" });
      continue;
    }
    if (state === "open") {
      const { button, accessory } = firsts(f.payload);
      if (component.id === "confirm") {
        if (button && "confirm" in button)
          out.push({ fixture, kind: "confirm", interaction: "confirm" });
      } else if (component.id === "select-dialog") {
        if (accessory && String(accessory.type).startsWith("multi_"))
          out.push({ fixture, kind: "dialog", interaction: "dialog" });
      } else if (component.id === "option_group") {
        if (firstOpener(f.payload)) out.push({ fixture, kind: "open", interaction: "open" });
      } else if (firstOpener(f.payload) === component.id && !openerHasChips(f.payload))
        out.push({ fixture, kind: "open", interaction: "open" });
      else if (fixtureInteraction(component, state))
        out.push({
          fixture,
          kind: "fixture-state",
          interaction: fixtureInteraction(component, state),
        });
      continue;
    }
    const interaction = fixtureInteraction(component, state);
    if (interaction) out.push({ fixture, kind: "fixture-state", interaction });
  }
  return out;
}

/** The captures that would show a cell, of every kind. */
function candidates(
  cell: Cell,
  component: Component,
  fixtures: Where,
  forecasts: Map<string, { fixture: string; forecast: ProbeForecast }>,
  components: Component[],
  snapshots: Map<string, { probe: string; steps: Step[] }>,
): Candidate[] {
  const capability = cell.capture!.capability;
  const state = cell.state as StateId;
  const fit = [...fixtures].filter(([, f]) => cell.width !== "mobile" || f.surface === "message");
  if (capability === "reference" || capability === "fixture-state")
    return referenceCandidates(cell, component, fixtures);

  const out: Candidate[] = [];
  const fact: FactKind = cell.fact;
  // A probe's mid-step snapshot (`{ "snapshot": "<label>" }`): open, then hover, and so on. A
  // probe item run in another theme or width takes its snapshots there (snapshot-only).
  if (fact === "styles")
    for (const [name, { probe, steps }] of snapshots) {
      const { fixture, interaction } = parseReferenceName(name);
      const f = fixtures.get(fixture);
      if (!f || (cell.width === "mobile" && f.surface !== "message")) continue;
      const variant = formatReferenceName({
        fixture,
        interaction,
        theme: cell.theme as Theme,
        mobile: cell.width === "mobile",
      });
      const focus = forecastFocus(steps, f.payload);
      const shows = referenceEvidence(
        variant,
        f.payload,
        components,
        focus ? { focus } : {},
        steps,
      ).some(
        (e) =>
          e.component === component.id &&
          e.state === state &&
          e.fact === "styles" &&
          e.theme === cell.theme &&
          e.width === cell.width,
      );
      if (shows)
        out.push({
          fixture,
          kind: "probe",
          interaction: probe.split("@")[1],
          theme: cell.theme as Theme,
          width: cell.width as Width,
        });
    }
  if (fact === "styles") {
    if (state === "hover" || state === "focus-visible" || state === "pressed")
      for (const [fixture, f] of fit) {
        // A layer's options and buttons only exist once it's open, and a collapsed plan's or task
        // card's insides once it's expanded: probes reach those (snapshotProbes). The Builder draws
        // the message header as plain text, which takes no focus.
        const addresses = addressesOf(f.payload, component.id, components, {
          layers: false,
        }).filter(
          (a) =>
            !revealedBy(f.payload, a) &&
            !NOT_DRAWN.has(parseTarget(a)!.kind) &&
            !(state === "focus-visible" && UNFOCUSABLE.includes(parseTarget(a)!.kind)),
        );
        if (addresses.length === 0) continue;
        // Hover and focus are captured with the input held, which also shows what no rule says
        // (a tooltip, the cursor's effect); pressed can't be held through a snapshot, so a plain
        // capture's state styles (its controls' :active rules) record it.
        if (state === "pressed") out.push({ fixture, kind: "rest" });
        else
          out.push({
            fixture,
            kind: state === "hover" ? "hover" : "focus",
            interaction: `${state === "hover" ? "hover" : "focus"}-${shownAtRest(addresses[0]!)}`,
          });
      }
    else if (state === "validation-error")
      for (const [fixture, f] of fit)
        if (f.surface === "modal")
          out.push({ fixture, kind: "submit-errors", interaction: "submit-errors" });
    if (state === "full-content")
      for (const [fixture] of fit) out.push({ fixture, kind: "full", full: true });
    if (state === "scrolled-end")
      for (const [fixture] of fit)
        out.push({ fixture, kind: "scrolled-end", interaction: "scrolled-end" });
    return out;
  }
  if (fact === "behaviour") {
    // Every new capture records the preview's scroll containers at its width.
    if (state === "scrolled-end")
      for (const [fixture] of fit)
        out.push({
          fixture,
          kind: "scrolled-end",
          interaction: "scrolled-end",
          theme: "light",
          width: cell.width as Width,
        });
    if (state === "validation-error")
      for (const [fixture, f] of fixtures)
        if (f.surface === "modal")
          out.push({
            fixture,
            kind: "submit-errors",
            interaction: "submit-errors",
            theme: "light",
            width: "desktop",
          });
    for (const [name, { fixture, forecast }] of forecasts)
      if (forecast.behaviour.some((b) => b.component === component.id && b.state === state))
        out.push({
          fixture,
          kind: "probe",
          interaction: name.split("@")[1],
          theme: "light",
          width: "desktop",
        });
    return out;
  }
  if (fact === "payload") {
    for (const [name, { fixture, forecast }] of forecasts)
      if (forecast.payload.some((p) => p.component === component.id && p.event === cell.state))
        out.push({
          fixture,
          kind: "probe",
          interaction: name.split("@")[1],
          theme: "light",
          width: "desktop",
        });
    return out;
  }
  return out;
}

/** Why no capture reaches an uncovered cell. */
function unplannedReason(cell: Cell): string {
  const capability = cell.capture!.capability;
  const state = String(cell.state);
  if (capability === "real-input" && cell.component === "contact_card")
    return `${state} of a contact card, which Block Kit Builder doesn't reliably draw for a placeholder user (NOT_DRAWN)`;
  if (
    capability === "real-input" &&
    state === "focus-visible" &&
    (cell.component === "message-header" || cell.component === "card")
  )
    return `focus-visible styles of the ${cell.component}, which takes no focus itself in the Builder (targets.ts UNFOCUSABLE)`;
  if (capability === "real-input")
    return cell.fact === "styles"
      ? `${state} styles of something that isn't a control address (targets.ts kinds)`
      : `${state} reached only by input no capture kind holds yet`;
  if (capability === "validation-probe")
    return cell.width === "mobile"
      ? "validation at the mobile width: only modals submit, and they preview at desktop"
      : "validation of a component in no modal fixture";
  if (capability === "behaviour-probe")
    return `${cell.fact} in the ${state} state: no probe records it yet`;
  if (capability === "actions-preview") return `${state} payload: no probe sends it yet`;
  if (capability === "css-rules")
    return `${state} ${cell.fact}: needs the stylesheet facts capability`;
  if (capability === "unclipped" || capability === "scrolled-end")
    return `${state}: no fixture of it at this width`;
  return `${capability} ${state}`;
}

export function capturePlan(
  inventory: Inventory,
  components: Component[],
  payloads: Map<string, unknown>,
  references: Set<string> = new Set(),
  probes: Map<string, Probe> = new Map(),
  /** Behaviour recordings already made (`<fixture>@<probe>`). */
  recorded: Set<string> = new Set(),
  /**
   * Fixtures whose desktop references recorded their scroll containers with none overflowing:
   * Slack fits the block at desktop width, so a probe can't scroll it (probes record at desktop).
   */
  fits: Set<string> = new Set(),
  /** The same at the mobile width: nothing scrolls sideways, so `@scrolled-end+mobile` can't. */
  fitsMobile: Set<string> = new Set(),
): CapturePlan {
  // The inventory's components carry the states the stylesheet discovery added: plan with those.
  const cellStates = new Map<string, Set<string>>();
  for (const c of inventory.cells) {
    if (!cellStates.has(c.component)) cellStates.set(c.component, new Set());
    cellStates.get(c.component)!.add(String(c.state));
  }
  components = components.map((c) => {
    const extra = [...(cellStates.get(c.id) ?? [])].filter(
      (st): st is StateId =>
        !(c.states as string[]).includes(st) && (STATE_IDS as readonly string[]).includes(st),
    );
    return extra.length > 0 ? { ...c, states: [...c.states, ...extra] } : c;
  });
  const byId = new Map(components.map((c) => [c.id, c]));
  const PLANNABLE = new Set([
    "reference",
    "fixture-state",
    "real-input",
    "validation-probe",
    "behaviour-probe",
    "actions-preview",
    "unclipped",
    "scrolled-end",
  ]);
  const open = inventory.cells.filter(
    (c) =>
      !c.covered &&
      !c.na &&
      c.capture &&
      c.capture.method !== "c" &&
      PLANNABLE.has(c.capture.capability),
  );

  // Where each component appears.
  const where = new Map<string, Where>();
  for (const id of new Set(open.map((c) => c.component))) {
    const c = byId.get(id)!;
    const m: Where = new Map();
    for (const [fixture, payload] of payloads) {
      const root = payload as Obj;
      const nodes = [...objects(payload)]
        .filter(([o, key]) => c.match(o, key, root))
        .map(([o]) => o);
      if (nodes.length > 0) m.set(fixture, { payload, surface: surfaceOf(root), nodes });
    }
    where.set(id, m);
  }
  const snapshots = new Map(
    [...probes].flatMap(([probe, spec]) =>
      [...probeSnapshots(new Map([[probe, spec]]))].map(
        ([name, steps]) => [name, { probe, steps }] as const,
      ),
    ),
  );
  const forecasts = new Map(
    [...probes].flatMap(([name, probe]) => {
      const fixture = name.split("@")[0]!;
      const payload = payloads.get(fixture);
      return payload === undefined
        ? []
        : [[name, { fixture, forecast: forecastProbe(name, probe, payload, components) }] as const];
    }),
  );

  // Candidate captures per cell, and the cells each would cover.
  interface Option extends Candidate {
    theme: Theme;
    width: Width;
    cells: Cell[];
  }
  const byName = new Map<string, Option>();
  const orphans: Cell[] = [];
  const unplanned: Cell[] = [];
  /** Cells only a probe that's already recorded could show: the recording didn't. */
  const recordedOnly = new Set<string>();
  for (const cell of open) {
    const component = byId.get(cell.component)!;
    const found = candidates(
      cell,
      component,
      where.get(cell.component)!,
      forecasts,
      components,
      snapshots,
    ).filter(
      (c) =>
        c.kind !== "scrolled-end" || !(cell.width === "mobile" ? fitsMobile : fits).has(c.fixture),
    );
    if (found.length === 0) {
      const fixtureFirst =
        cell.capture!.capability === "reference" || cell.capture!.capability === "fixture-state";
      (fixtureFirst ? orphans : unplanned).push(cell);
      continue;
    }
    let planned = false;
    for (const cand of found) {
      const theme: Theme = cand.theme ?? (cell.theme === "any" ? "light" : cell.theme);
      const width: Width = cand.width ?? (cell.width === "any" ? "desktop" : cell.width);
      // A probe recorded in light desktop has shown what it shows: its cells need another capture.
      if (
        cand.kind === "probe" &&
        theme === "light" &&
        width === "desktop" &&
        recorded.has(`${cand.fixture}@${cand.interaction}`)
      )
        continue;
      const name = formatReferenceName({
        fixture: cand.fixture,
        interaction: cand.interaction,
        theme,
        mobile: width === "mobile",
        ...(cand.full ? { full: true } : {}),
      });
      if (!byName.has(name)) byName.set(name, { ...cand, theme, width, cells: [] });
      byName.get(name)!.cells.push(cell);
      planned = true;
    }
    if (!planned) {
      unplanned.push(cell);
      if (found.length > 0) recordedOnly.add(cellKey(cell));
    }
  }

  // Greedy cover: the capture whose still-uncovered cells are worth most, until none is left.
  // Recapturing an existing reference (for the state styles it didn't record) comes last: it
  // replaces a maintainer-owned reference, so every new capture is tried first.
  const done = new Set<string>();
  const items: PlanItem[] = [];
  for (const recapture of [false, true])
    for (;;) {
      let best: [string, number, Cell[]] | undefined;
      for (const [name, n] of byName) {
        if (references.has(name) !== recapture) continue;
        const left = n.cells.filter((c) => !done.has(cellKey(c)));
        const value = left.reduce((v, c) => v + c.value, 0);
        if (left.length > 0 && (!best || value > best[1] || (value === best[1] && name < best[0])))
          best = [name, value, left];
      }
      if (!best) break;
      const [name, value, left] = best;
      const n = byName.get(name)!;
      for (const c of left) done.add(cellKey(c));
      items.push(item(name, n, payloads, references, value, left));
    }

  // A fixture-specific state with a probe of the same name is that probe: its steps perform it.
  for (const i of items)
    if (forecasts.has(i.name) && i.kind !== "probe") {
      i.kind = "probe";
      i.probe = `fixtures/${i.name}.probe.json`;
      i.manual = false;
      i.needsStateEntry = false;
    }

  // Every probe spec is recorded, also one whose cells another probe covers: probes tell apart
  // what the inventory's states don't (arrow keys from Escape from typeahead).
  // A probe already recorded (its .behaviour.json exists) isn't run again.
  for (const [name, { fixture }] of forecasts)
    if (!items.some((i) => i.name === name) && !recorded.has(name))
      items.push(
        item(
          name,
          {
            fixture,
            kind: "probe",
            interaction: name.split("@")[1],
            theme: "light",
            width: "desktop",
          },
          payloads,
          references,
          0,
          [],
        ),
      );

  // The references coverage.ts expects and doesn't find, when no item above is one of them.
  const planned = new Set(items.map((i) => i.name));
  for (const [fixture, payload] of payloads)
    for (const suffix of expectedStates(payload)) {
      const name = fixture + suffix;
      if (references.has(name) || planned.has(name)) continue;
      // Nothing scrolls sideways at that width, as its references measured.
      if (
        suffix.startsWith("@scrolled-end") &&
        (suffix.includes("mobile") ? fitsMobile : fits).has(fixture)
      )
        continue;
      const parsed = parseReferenceName(name);
      const kind: ItemKind = (parsed.interaction as ItemKind | undefined) ?? "rest";
      items.push({
        ...item(
          name,
          {
            fixture,
            kind,
            interaction: parsed.interaction,
            theme: parsed.theme,
            width: parsed.mobile ? "mobile" : "desktop",
          },
          payloads,
          references,
          0,
          [],
        ),
        expected: true,
      });
    }

  // A fixture that shows a real workspace file needs the maintainer's capture.local.json
  // substitute (README: Capture new references); it can't go in an ordinary session.
  const maintainer = items.filter((i) => needsFileSubstitute(payloads.get(i.fixture)));
  const skipped = items
    .filter((i) => i.fixture in NOT_CAPTURABLE)
    .map((i) => ({ name: i.name, reason: NOT_CAPTURABLE[i.fixture]! }));

  // One session per surface, theme and width, with every kind of capture in it.
  const groups = new Map<string, PlanItem[]>();
  for (const i of items.filter((x) => !maintainer.includes(x) && !(x.fixture in NOT_CAPTURABLE))) {
    const k = `${i.surface}+${i.theme}+${i.width}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  }
  const byValue = (a: PlanItem, b: PlanItem) => b.value - a.value || a.name.localeCompare(b.name);
  const sessions: Session[] = [...groups].map(([k, list]) => {
    const [surface, theme, width] = k.split("+") as [Surface, Theme, Width];
    return {
      id: k,
      surface,
      theme,
      width,
      automatic: list.filter((i) => !i.realInput).toSorted(byValue),
      realInput: list.filter((i) => i.realInput).toSorted(byValue),
      chunks: [
        ...chunk(k, "a", list.filter((i) => !i.realInput).toSorted(byValue)),
        ...chunk(k, "r", list.filter((i) => i.realInput).toSorted(byValue)),
      ],
      cells: list.reduce((n, i) => n + i.cells, 0),
      value: list.reduce((n, i) => n + i.value, 0),
    };
  });
  sessions.sort((a, b) => b.value - a.value);

  // States a probe's snapshot reaches in light at desktop width, and so nowhere else yet.
  const snapped = new Set(
    items
      .filter((i) => i.kind === "probe")
      .flatMap((i) =>
        i.covers.filter((c) => c.endsWith(" styles")).map((c) => c.replace(/ styles$/, "")),
      ),
  );
  const reasons = new Map<string, Cell[]>();
  for (const c of unplanned) {
    const r = recordedOnly.has(cellKey(c))
      ? `${c.state} ${c.fact}: the probe that should show it is recorded and didn't`
      : c.fact === "styles" && snapped.has(`${c.component} ${c.state}`)
        ? `${c.state} styles a probe snapshot shows, but probes record in light at desktop width only`
        : unplannedReason(c);
    if (!reasons.has(r)) reasons.set(r, []);
    reasons.get(r)!.push(c);
  }

  const proposals = propose(orphans, byId, where, payloads);
  const probeProposals = proposeProbes(unplanned, where, components, probes, fits);
  const live = items.filter((i) => !maintainer.includes(i) && !(i.fixture in NOT_CAPTURABLE));
  return {
    sessions,
    maintainer,
    skipped,
    proposals,
    probeProposals,
    unplanned: [...reasons]
      .map(([reason, cells]) => ({
        reason,
        cells: cells.length,
        components: [...new Set(cells.map((c) => c.component))].toSorted(),
      }))
      .toSorted((a, b) => b.cells - a.cells),
    totals: {
      items: live.length,
      realInputItems: live.filter((i) => i.realInput).length,
      maintainerItems: maintainer.length,
      manualItems: live.filter((i) => i.manual).length,
      expectedItems: live.filter((i) => i.expected).length,
      probes: live.filter((i) => i.kind === "probe").length,
      sessions: sessions.length,
      cellsCovered: done.size,
      cellsWithoutFixture: orphans.length,
      cellsUnplanned: unplanned.length,
      proposals: proposals.length,
    },
  };
}

/** The fixture order probes prefer: the element contexts, then the catalog, then the rest. */
const preference = (fixture: string) =>
  fixture.startsWith("contexts/") ? 0 : fixture.startsWith("catalog/") ? 1 : 2;

/**
 * Probe specs for the behaviour cells no probe reaches: per component, one on the first fixture
 * (by preference) where it's addressable. A control is hovered (its tooltip and delay), clicked
 * (what a press opens, picks or toggles) and let go with Escape; a link or mention is only hovered,
 * since a click leaves the preview; a layer's option or item is reached by opening the layer first;
 * a long list is opened and scrolled with the arrow keys.
 */
export function proposeProbes(
  cells: Cell[],
  where: Map<string, Where>,
  components: Component[],
  existing: Map<string, Probe>,
  fits: Set<string> = new Set(),
): ProbeProposal[] {
  const out = new Map(behaviourProbes(cells, where, components, existing).map((p) => [p.name, p]));
  for (const p of [
    ...snapshotProbes(cells, where, components, existing),
    ...scrollProbes(cells, where, components, existing, fits),
  ])
    if (!out.has(p.name)) out.set(p.name, p);
  return [...out.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Probes that snapshot a state no single capture reaches (light desktop, as probes record): an
 * open list with an option hovered or picked, an open confirm dialog with a button hovered.
 */
function snapshotProbes(
  cells: Cell[],
  where: Map<string, Where>,
  components: Component[],
  existing: Map<string, Probe>,
): ProbeProposal[] {
  const wanted = cells.filter((c) => c.fact === "styles");
  const want = new Set(wanted.map((c) => `${c.component} ${c.state}`));
  const fixtures = new Set(wanted.flatMap((c) => [...(where.get(c.component)?.keys() ?? [])]));
  const out: ProbeProposal[] = [];
  const done = new Set<string>();
  for (const fixture of [...fixtures].toSorted(
    (a, b) => preference(a) - preference(b) || a.localeCompare(b),
  )) {
    const payload = [...where.values()].find((w) => w.has(fixture))!.get(fixture)!.payload;
    // A multi-select showing chips may not open its list in Block Kit Builder.
    if (openerHasChips(payload)) continue;
    const counted = controlComponents(payload);
    const opener = (["field", "overflow", "menu"] as const).find(
      (k) => (counted[k]?.length ?? 0) > 0,
    );
    const confirming = [...objects(payload)]
      .filter(([o]) => o.type === "button")
      .findIndex(([o]) => "confirm" in o);
    const specs: [string, Step[]][] = [];
    const open = opener ? openSteps(payload, `${opener}-1`) : [];
    if (opener) {
      specs.push([
        `open-hover-option-1`,
        [...open, { hover: "option-1" }, { snapshot: "open-hover-option-1" }, { key: "Escape" }],
      ]);
      specs.push([
        `open-pick-option-1`,
        [...open, { click: "option-1" }, { snapshot: "open-pick-option-1" }, { key: "Escape" }],
      ]);
    }
    if (opener) {
      // Keyboard focus in an open list or menu: the highlight moves (aria-activedescendant).
      if (opener !== "field")
        specs.push([
          `open-focus-menuitem-1`,
          [...open, { key: "ArrowDown" }, { snapshot: "open-focus-menuitem-1" }, { key: "Escape" }],
        ]);
      specs.push([
        `open-focus-option-1`,
        [...open, { key: "ArrowDown" }, { snapshot: "open-focus-option-1" }, { key: "Escape" }],
      ]);
    }
    if ((counted.chip?.length ?? 0) > 0 && opener)
      specs.push([
        `chip-focus-1`,
        [...open, { key: "Escape" }, { key: "ArrowLeft" }, { snapshot: "chip-focus-1" }],
      ]);
    if (confirming >= 0) {
      specs.push([
        `confirm-focus-tab-1`,
        [
          { click: `button-${confirming + 1}` },
          { key: "Tab" },
          { snapshot: "confirm-focus-tab-1" },
          { key: "Escape" },
        ],
      ]);
      specs.push([
        `confirm-focus-tab-2`,
        [
          { click: `button-${confirming + 1}` },
          { key: "Tab" },
          { key: "Tab" },
          { snapshot: "confirm-focus-tab-2" },
          { key: "Escape" },
        ],
      ]);
    }
    // A collapsed plan's or task card's insides (its sources, the links in its text, its task
    // headers), hovered once its pill has expanded it.
    for (const [kind, list] of [
      ...Object.entries(counted),
      ...(counted.pill?.includes("plan") ? [["task", ["plan"]] as const] : []),
    ])
      for (let i = 1; i <= (list?.length ?? 0); i++) {
        const address = `${kind}-${i}`;
        const reveal = revealSteps(payload, address);
        if (reveal.length > 0)
          specs.push([
            `expanded-hover-${address}`,
            [...reveal, { hover: address }, { snapshot: `expanded-hover-${address}` }],
          ]);
      }
    if (confirming >= 0)
      for (const b of ["confirm", "deny"])
        specs.push([
          `confirm-hover-${b}-1`,
          [
            { click: `button-${confirming + 1}` },
            { hover: `${b}-1` },
            { snapshot: `confirm-hover-${b}-1` },
            { click: "deny-1" },
          ],
        ]);
    for (const [label, steps] of specs) {
      const name = `${fixture}@${label}`;
      if (existing.has(name)) continue;
      const snap = `${fixture}@${label}`;
      const before = steps.slice(
        0,
        steps.findIndex((s) => "snapshot" in s),
      );
      const focus = forecastFocus(before, payload);
      const covers = referenceEvidence(snap, payload, components, focus ? { focus } : {}, before)
        .filter(
          (e) =>
            e.fact === "styles" &&
            want.has(`${e.component} ${e.state}`) &&
            !done.has(`${e.component} ${e.state}`),
        )
        .map((e) => `${e.component} ${e.state}`);
      if (covers.length === 0) continue;
      for (const c of covers) done.add(c);
      out.push({ name, probe: { steps }, covers: [...new Set(covers)] });
    }
  }
  return out;
}

/**
 * Probes that scroll a block sideways to its end, for the many-items behaviour of wide blocks, on a
 * fixture whose block overflows at desktop width (not one in `fits`: Slack's 432px table fits).
 */
function scrollProbes(
  cells: Cell[],
  where: Map<string, Where>,
  components: Component[],
  existing: Map<string, Probe>,
  fits: Set<string>,
): ProbeProposal[] {
  const out: ProbeProposal[] = [];
  for (const id of new Set(
    cells.filter((c) => c.fact === "behaviour" && c.state === "many-items").map((c) => c.component),
  )) {
    const fixtures = [...(where.get(id) ?? [])].toSorted(
      ([a], [b]) => preference(a) - preference(b) || a.localeCompare(b),
    );
    for (const [fixture, f] of fixtures) {
      if (fits.has(fixture)) continue;
      const name = `${fixture}@scroll-scroller-1`;
      const probe: Probe = { steps: [{ scroll: "scroller-1", left: "end" }] };
      const covers = forecastProbe(name, probe, f.payload, components)
        .behaviour.filter((b) => b.component === id && b.state === "many-items")
        .map((b) => `${b.component} ${b.state}`);
      if (covers.length > 0 && !existing.has(name)) {
        out.push({ name, probe, covers });
        break;
      }
    }
  }
  return out;
}

function behaviourProbes(
  cells: Cell[],
  where: Map<string, Where>,
  components: Component[],
  existing: Map<string, Probe>,
): ProbeProposal[] {
  const BEHAVIOUR = new Set([
    "default",
    "focus-visible",
    "hover",
    "pressed",
    "open",
    "selected",
    "toggled",
    "many-items",
  ]);
  const wanted = new Map<string, Set<string>>();
  for (const c of cells)
    if (c.fact === "behaviour" && BEHAVIOUR.has(String(c.state))) {
      if (!wanted.has(c.component)) wanted.set(c.component, new Set());
      wanted.get(c.component)!.add(String(c.state));
    }
  const out = new Map<string, ProbeProposal>();
  for (const [id, states] of wanted) {
    const fixtures = [...(where.get(id) ?? [])].toSorted(
      ([a], [b]) => preference(a) - preference(b) || a.localeCompare(b),
    );
    for (const [fixture, f] of fixtures) {
      const addresses = addressesOf(f.payload, id, components);
      const first =
        addresses.find((a) => !UNVERIFIED.includes(parseTarget(a)!.kind)) ?? addresses[0];
      if (!first) continue;
      const address = shownAtRest(first);
      if (NOT_DRAWN.has(parseTarget(address)!.kind)) continue;
      const kind = parseTarget(address)!.kind;
      const counted = controlComponents(f.payload);
      const opener = (["field", "overflow", "menu"] as const).find(
        (k) => (counted[k]?.length ?? 0) > 0,
      );
      const confirming = [...objects(f.payload)]
        .filter(([o]) => o.type === "button")
        .findIndex(([o]) => "confirm" in o);
      let steps: Step[];
      // A control inside a collapsed plan or task card is there once its pill expands it.
      const reveal = revealSteps(f.payload, address);
      if (kind === "link" || kind === "mention")
        steps = [...reveal, { hover: address }, { wait: 1500 }];
      else if (kind === "option" || kind === "menuitem") {
        if (!opener) continue;
        steps = [
          ...openSteps(f.payload, `${opener}-1`),
          { hover: address },
          { wait: 800 },
          { key: "Escape" },
        ];
      } else if (kind === "tooltip") {
        // A tooltip shows after a hover on its control: hover that, wait, snapshot.
        const trigger = (["icon", "feedback", "card", "button"] as const).find(
          (k) => (counted[k]?.length ?? 0) > 0,
        );
        if (!trigger) continue;
        // A tooltip takes no pointer (pointer-events: none), so it's captured while it shows.
        steps = [
          { hover: `${trigger}-1` },
          { wait: 1200 },
          { snapshot: `tooltip-over-${trigger}-1` },
        ];
      } else if (kind === "confirm" || kind === "deny") {
        if (confirming < 0) continue;
        steps = [
          { click: `button-${confirming + 1}` },
          { hover: address },
          { wait: 800 },
          { click: "deny-1" },
        ];
      } else if (kind === "submit" || kind === "cancel") continue;
      else if (kind === "input")
        steps = [{ hover: address }, { wait: 1000 }, { click: address }, { type: "a" }];
      else
        steps = [
          ...reveal,
          { hover: address },
          { wait: 1000 },
          { click: address },
          { wait: 300 },
          { key: "Escape" },
        ];
      const add = (name: string, probe: Probe) => {
        if (existing.has(name) || out.has(name)) return;
        const forecast = forecastProbe(name, probe, f.payload, components);
        const covers = forecast.behaviour
          .filter((b) => b.component === id && states.has(b.state))
          .map((b) => `${b.component} ${b.state}`);
        if (covers.length > 0) out.set(name, { name, probe, covers });
      };
      add(`${fixture}@poke-${address}`, { steps });
      if (states.has("many-items") && opener)
        add(`${fixture}@scroll-${opener}-1`, {
          steps: [
            ...openSteps(f.payload, `${opener}-1`),
            ...Array.from({ length: 12 }, () => ({ key: "ArrowDown" })),
            { key: "Escape" },
          ],
        });
      if ([...out.values()].some((p) => p.covers.some((c) => c.startsWith(`${id} `)))) break;
    }
  }
  return [...out.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * The fixtures whose references at `width` measured their content's width (scroll containers, or
 * a `+full` capture) and found nothing overflowing (capturePlan's `fits` and `fitsMobile`), from
 * the references' metas (captures.ts referenceMeta). One reference that overflowed keeps the
 * fixture out.
 */
export function fitsAt(
  references: Map<string, { measured?: boolean; overflows?: boolean }>,
  width: Width,
): Set<string> {
  const fits = new Set<string>();
  const overflows = new Set<string>();
  for (const [name, meta] of references) {
    const { fixture, mobile } = parseReferenceName(name);
    if (!meta.measured || (mobile ? "mobile" : "desktop") !== width) continue;
    (meta.overflows ? overflows : fits).add(fixture);
  }
  return new Set([...fits].filter((f) => !overflows.has(f)));
}

export const fitsAtDesktop = (
  references: Map<string, { measured?: boolean; overflows?: boolean }>,
) => fitsAt(references, "desktop");

/** Splits a session's items into runs of at most SESSION_SIZE, numbered `#a01`, `#r01`…. */
function chunk(session: string, prefix: "a" | "r", items: PlanItem[]): Session["chunks"] {
  const out: Session["chunks"] = [];
  for (let i = 0; i < items.length; i += SESSION_SIZE)
    out.push({
      id: `${session}#${prefix}${String(i / SESSION_SIZE + 1).padStart(2, "0")}`,
      realInput: prefix === "r",
      items: items.slice(i, i + SESSION_SIZE).map((x) => x.name),
    });
  return out;
}

/**
 * A chunk's items as capture.js takes them: `{ name, payload, probe? }`. A probe item's spec is
 * read from its `.probe.json`, by the probe's own name (`<fixture>@<probe>`, without modifiers).
 */
export function chunkItems(
  plan: CapturePlan,
  id: string,
  payloads: Map<string, unknown>,
  probes: Map<string, Probe>,
): { name: string; payload: unknown; probe?: Probe }[] {
  const session = plan.sessions.find((s) => s.chunks.some((c) => c.id === id));
  const c = session?.chunks.find((x) => x.id === id);
  if (!session || !c) throw new Error(`no chunk ${id}`);
  const all = [...session.automatic, ...session.realInput];
  return c.items.map((name) => {
    const i = all.find((x) => x.name === name)!;
    const json = payloads.get(i.fixture);
    const probe = i.kind === "probe" ? probes.get(`${i.fixture}@${i.interaction}`) : undefined;
    return {
      name,
      payload: Array.isArray(json) ? { blocks: json } : json,
      ...(probe ? { probe } : {}),
    };
  });
}

function item(
  name: string,
  n: Candidate & { theme: Theme; width: Width },
  payloads: Map<string, unknown>,
  references: Set<string>,
  value: number,
  cells: Cell[],
): PlanItem {
  const manual =
    n.kind === "fixture-state" ||
    (!!n.interaction && !AUTOMATIC.has(n.interaction) && n.kind === "rest");
  return {
    name,
    kind: n.kind,
    fixture: n.fixture,
    path: `fixtures/${n.fixture}.json`,
    ...(n.kind === "probe" ? { probe: `fixtures/${n.fixture}@${n.interaction}.probe.json` } : {}),
    ...(n.kind === "probe" && (n.theme !== "light" || n.width !== "desktop")
      ? { snapshotOnly: true }
      : {}),
    surface: surfaceOf(payloads.get(n.fixture) as Obj),
    theme: n.theme,
    width: n.width,
    ...(n.interaction ? { interaction: n.interaction } : {}),
    realInput: REAL_INPUT.has(n.kind),
    manual,
    needsStateEntry: n.kind === "fixture-state" && !(`${n.fixture}@${n.interaction}` in STATES),
    ...(references.has(name) ? { recapture: true } : {}),
    cells: cells.length,
    value,
    covers: [...new Set(cells.map((c) => `${c.component} ${c.state} ${c.fact}`))].toSorted(),
  };
}

// Proposals

const LONG =
  "This sentence is here to make the text long enough to wrap onto several lines at the desktop width, and further still on a phone, so the wrapping, the line height and any truncation Slack applies all show. It goes on a little longer, past three hundred characters, which is where long text starts to behave differently.";
/** The longest text a field takes (limits.ts), so long content stays a payload Slack accepts. */
function longest(type: string, key: string): number {
  if (key === "placeholder") return 150;
  if (type.endsWith("button") && key === "text") return 75;
  if (type === "header" || type === "container" || type === "card") return 150;
  if (type === "alert") return 200;
  if (type === "video") return 199;
  // A confirm object has no type.
  if (type === "undefined") return key === "title" ? 100 : 300;
  return LONG.length;
}
const upTo = (n: number) => (LONG.length <= n ? LONG : `${LONG.slice(0, n - 1).trimEnd()}.`);
const plain = (text: string) => ({ type: "plain_text", text, emoji: true });
const option = (n: number, extra: Obj = {}) => ({
  text: plain(`Option ${n}`),
  value: `value-${n}`,
  ...extra,
});

/** How many items show a list at Slack's limit, per array key and element type. */
function manyFor(type: string, key: string): number {
  if (type === "overflow") return 5;
  if (type === "checkboxes" || type === "radio_buttons") return 10;
  if (key === "options") return 20;
  if (key === "fields") return 10;
  if (type === "actions") return 25;
  return 10;
}

/** The state's variation of a node, or undefined when none can be written mechanically. */
export function vary(node: Obj, state: string): Obj | undefined {
  const varied = varyOptions(node, state);
  return varied && keepInitialOptions(varied);
}

/**
 * Points a node's initial options back at its options after they were replaced: Block Kit Builder
 * refuses an initial option that isn't one of them (limits.ts initial-option).
 */
function keepInitialOptions(n: Obj): Obj {
  const options = [
    ...((n.options ?? []) as Obj[]),
    ...((n.option_groups ?? []) as Obj[]).flatMap((g) => (g.options ?? []) as Obj[]),
  ];
  if (options.length === 0) return n;
  const values = new Set(options.map((o) => o.value));
  if (n.initial_option && !values.has((n.initial_option as Obj).value))
    n.initial_option = options[0];
  if (Array.isArray(n.initial_options)) {
    const kept = (n.initial_options as Obj[]).filter((o) => values.has(o.value));
    n.initial_options = kept.length > 0 ? kept : [options[0]];
  }
  return n;
}

function varyOptions(node: Obj, state: string): Obj | undefined {
  const type = String(node.type);
  const n = structuredClone(node) as Obj;
  switch (state) {
    case "long-content": {
      for (const k of ["text", "label", "title", "placeholder"])
        if (n[k] && typeof n[k] === "object" && "text" in (n[k] as Obj)) {
          (n[k] as Obj).text = upTo(longest(type, k));
          return n;
        }
      if (Array.isArray(n.options) && n.options.length > 0) {
        (n.options as Obj[])[0] = option(1, { text: plain(upTo(75)) });
        return n;
      }
      return undefined;
    }
    case "many-items": {
      const key = ["options", "elements", "fields", "rows"].find(
        (k) => Array.isArray(n[k]) && (n[k] as unknown[]).length > 0,
      );
      if (!key) return undefined;
      const list = n[key] as unknown[];
      const count = manyFor(type, key);
      n[key] =
        key === "options"
          ? Array.from({ length: count }, (_, i) => option(i + 1))
          : Array.from({ length: count }, (_, i) => {
              // Action and block IDs stay unique, as Slack requires (limits.ts).
              const copy = structuredClone(list[i % list.length]) as Obj;
              if (typeof copy.action_id === "string") copy.action_id = `${copy.action_id}_${i + 1}`;
              if (typeof copy.block_id === "string") copy.block_id = `${copy.block_id}_${i + 1}`;
              return copy;
            });
      return n;
    }
    case "mixed": {
      if (type.endsWith("static_select")) {
        delete n.options;
        n.option_groups = [
          { label: plain("Group one"), options: [option(1), option(2)] },
          { label: plain("Group two"), options: [option(3), option(4)] },
        ];
        return n;
      }
      if (type === "checkboxes" || type === "radio_buttons") {
        n.options = [1, 2, 3].map((i) => option(i, { description: plain(`Description ${i}`) }));
        return n;
      }
      if (type === "overflow") {
        n.options = [option(1), option(2, { url: "https://example.com" })];
        return n;
      }
      if (type === "button") {
        n.style = "danger";
        return n;
      }
      return undefined;
    }
    case "initial-value": {
      const opts = n.options as Obj[] | undefined;
      if (/^multi_static_select$|^checkboxes$/.test(type) && opts?.[0])
        n.initial_options = [opts[0]];
      else if (/static_select$|^radio_buttons$/.test(type) && opts?.[0]) n.initial_option = opts[0];
      else if (type === "datepicker") n.initial_date = "2026-01-15";
      else if (type === "timepicker") n.initial_time = "09:30";
      else if (type === "datetimepicker") n.initial_date_time = 1767261600;
      else if (type === "rich_text_input")
        n.initial_value = {
          type: "rich_text",
          elements: [
            { type: "rich_text_section", elements: [{ type: "text", text: "Initial value" }] },
          ],
        };
      else if (type === "email_text_input") n.initial_value = "name@example.com";
      else if (type === "url_text_input") n.initial_value = "https://example.com";
      else if (/text_input$|^number_input$/.test(type))
        n.initial_value = type === "number_input" ? "42" : "Initial value";
      else if (type === "users_select") n.initial_user = "U0123456789";
      else if (type === "multi_users_select") n.initial_users = ["U0123456789"];
      else if (type === "conversations_select") n.initial_conversation = "C0123456789";
      else if (type === "channels_select") n.initial_channel = "C0123456789";
      else return undefined;
      return n;
    }
    case "empty": {
      for (const k of Object.keys(n)) if (k.startsWith("initial_")) delete n[k];
      return n;
    }
    default:
      return n;
  }
}

/**
 * The source fixture with `node` replaced by `varied`, cut down to the top-level block that holds
 * it (and the surface around it), so the proposal keeps the context the fixture gave the node.
 * A node that is the payload itself (a modal's frame) is replaced whole.
 */
export function substitute(root: Obj, node: Obj, varied: Obj): Obj {
  if (node === root) return varied;
  const replace = (value: unknown): unknown => {
    if (value === node) return varied;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    return value;
  };
  const blocks = (root.blocks as Obj[] | undefined) ?? [];
  const holder = blocks.find((b) => [...objects(b)].some(([o]) => o === node));
  const { attachments: _, ...surface } = root;
  return { ...surface, blocks: holder ? [replace(holder)] : (replace(blocks) as Obj[]) };
}

/** Payloads for components no fixture has, written by hand. */
const FROM_SCRATCH: Record<string, { payload: Obj; incomplete?: string }> = {
  option_group: {
    payload: {
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              action_id: "grouped",
              placeholder: plain("Select an item"),
              option_groups: [
                { label: plain("Group one"), options: [option(1), option(2)] },
                { label: plain("Group two"), options: [option(3), option(4)] },
              ],
            },
          ],
        },
      ],
    },
  },
  "show-more": {
    payload: {
      blocks: [{ type: "section", text: { type: "mrkdwn", text: `${LONG} ${LONG} ${LONG}` } }],
    },
  },
  "message-attachments": {
    payload: {
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "A message with an attachment" } }],
      attachments: [
        {
          color: "#2eb886",
          blocks: [{ type: "section", text: { type: "mrkdwn", text: "Inside the attachment" } }],
        },
      ],
    },
  },
  "rich_text.team": {
    payload: richText({ type: "team", team_id: "T0123456789" }),
  },
};

function richText(element: Obj): Obj {
  return {
    blocks: [
      {
        type: "rich_text",
        elements: [
          { type: "rich_text_section", elements: [{ type: "text", text: "See " }, element] },
        ],
      },
    ],
  };
}

function propose(
  orphans: Cell[],
  byId: Map<string, Component>,
  where: Map<string, Map<string, { payload: unknown; surface: Surface; nodes: Obj[] }>>,
  payloads: Map<string, unknown>,
): Proposal[] {
  const groups = new Map<string, Cell[]>();
  for (const cell of orphans) {
    const state = cell.fact === "motion" ? "default" : String(cell.state);
    const k = `${cell.component}|${state}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(cell);
  }
  const out: Proposal[] = [];
  for (const [k, cells] of groups) {
    const [id, state] = k.split("|") as [string, string];
    const component = byId.get(id)!;
    const dir = fidelityDir(id);
    const path = `fixtures/extra/fidelity/${dir}/${state}.json`;
    const names = [
      ...new Set(
        cells.map((c) => {
          const interaction =
            state === "open" && /select$|picker$|^overflow$/.test(id)
              ? "open"
              : state === "open" && id === "confirm"
                ? "confirm"
                : state === "open" && id === "select-dialog"
                  ? "dialog"
                  : fixtureInteraction(component, state as StateId);
          return formatReferenceName({
            fixture: path.slice("fixtures/".length, -".json".length),
            interaction,
            theme: c.theme === "any" ? "light" : c.theme,
            mobile: c.width === "mobile",
          });
        }),
      ),
    ].toSorted();
    const value = cells.reduce((v, c) => v + c.value, 0);
    const base = { path, component: id, states: [state], names, cells: cells.length, value };

    // Start from the component as an existing fixture writes it, when one does.
    const seen = where.get(id);
    // A message fixture when any cell is at the mobile width, which only messages preview at.
    const entries = seen ? [...seen.entries()] : [];
    const first =
      entries.find(([, f]) => f.surface === "message" && cells.some((c) => c.width === "mobile")) ??
      entries[0];
    if (first) {
      const [fixture] = first;
      const [node] = [...objects(payloads.get(fixture))].find(([o, kk]) =>
        component.match(o, kk, payloads.get(fixture) as Obj),
      )!;
      const varied = vary(node, state);
      if (state === "open" && /select$|picker$|^overflow$/.test(id))
        out.push({
          ...base,
          reason: `No fixture opens ${id} first: make it the payload's first control that opens`,
          payload: substitute(payloads.get(fixture) as Obj, node, vary(node, "default")!),
        });
      else if (state === "open" && id === "confirm")
        out.push({
          ...base,
          reason: "No fixture's first button carries the confirm",
          payload: {
            blocks: [
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    action_id: "confirm",
                    text: plain("Delete"),
                    style: "danger",
                    confirm: node,
                  },
                ],
              },
            ],
          },
        });
      else if (varied)
        out.push({
          ...base,
          reason: `No fixture shows ${id} in its ${state} state`,
          payload: substitute(payloads.get(fixture) as Obj, node, varied),
        });
      else
        out.push({
          ...base,
          reason: `No fixture shows ${id} in its ${state} state`,
          incomplete: cells.some((c) => c.origin === "builder-css")
            ? `Slack's stylesheet has this ${state} variant of ${id}; find which payload, if any, produces it`
            : `Write the ${state} variation of ${fixture}'s ${id} by hand`,
        });
      continue;
    }
    const scratch = FROM_SCRATCH[id];
    if (scratch) {
      out.push({
        ...base,
        reason: `No fixture has ${id}`,
        payload: scratch.payload,
        ...(scratch.incomplete ? { incomplete: scratch.incomplete } : {}),
      });
      continue;
    }
    if (component.kind === "rich-text") {
      out.push({
        ...base,
        reason: `No fixture has ${id}, and the package doesn't render it yet`,
        payload: richText({ type: id.slice("rich_text.".length) }),
        incomplete: `Add the fields ${component.docs ? `https://docs.slack.dev/reference/block-kit/${component.docs}` : "Slack's reference"} requires, with placeholder IDs`,
      });
      continue;
    }
    out.push({ ...base, reason: `No fixture has ${id}`, incomplete: "Write a payload by hand" });
  }
  // Only a message previews at the mobile width.
  for (const p of out)
    if (p.payload && surfaceOf(p.payload as Obj) !== "message")
      p.names = p.names.filter((n) => !parseReferenceName(n).mobile);
  return out.toSorted((a, b) => b.value - a.value || a.path.localeCompare(b.path));
}

// The verification session

/**
 * A short session that proves every capture kind end to end before the big ones: one item of each,
 * in the order to run (automatic first, then real input), with what to check after each. Run it in
 * a freshly loaded Builder; every name is new except extra/payloads/selects@mobile, recaptured next
 * to a +mobile+dark item to settle whether the Builder dropped the select placeholder's dashes.
 */
export const VERIFY: { name: string; kind: ItemKind; check: string }[] = [
  {
    name: "extra/fidelity/button/long-content",
    kind: "rest",
    check:
      "plain message, light desktop: imports, and its meta has stateStyles for button-1 and scrollers when any",
  },
  {
    name: "extra/fidelity/static-select/many-items@open",
    kind: "open",
    check: "@open performed by capture.js: the list layer is frozen in the reference",
  },
  {
    name: "extra/payloads/selects@mobile",
    kind: "rest",
    check:
      "recapture of the light mobile select placeholder (settled: finding select-placeholder-dashes)",
  },
  {
    name: "catalog/data-visualization/bar-single-series@scrolled-end+mobile",
    kind: "scrolled-end",
    check: "the chart's scroller is scrolled to its end before the snapshot",
  },
  {
    name: "catalog/data-visualization/bar-single-series@mobile+full",
    kind: "full",
    check: "+full: the preview is widened by what the scroller hides, the 400px card shows whole",
  },
  {
    name: "extra/fidelity/static-select/many-items@mobile+dark",
    kind: "rest",
    check: "+mobile+dark: the Mobile preview follows the dark theme",
  },
  {
    name: "catalog/actions/button@hover-button-1",
    kind: "hover",
    check: "real hover held through the snapshot (needs the pointer adapter)",
  },
  {
    name: "contexts/static_select/actions@focus-field-1",
    kind: "focus",
    check: "keyboard focus: the field shows its :focus-visible ring",
  },
  {
    name: "message/mrkdwn@hover-link-1",
    kind: "hover",
    check: "new kind link: the first link resolves and shows its hover underline",
  },
  {
    name: "extra/fidelity/show-more/default@hover-more-1",
    kind: "hover",
    check:
      "unverified selector more: capture stops with \"the preview has no more-1\" if it's wrong; also shows Slack's truncation",
  },
  {
    name: "catalog/actions/button@hover-action-1",
    kind: "hover",
    check: "unverified selector action: the message toolbar appears on hover",
  },
  {
    name: "contexts/button/accessory@poke-button-1",
    kind: "probe",
    check: "probe with a payload: writes .behaviour.json and .actions.json (block_actions, button)",
  },
  {
    name: "contexts/static_select/actions@keyboard",
    kind: "probe",
    check:
      "keyboard probe: observations step through the list (activeOption) and end with a block_actions",
  },
  {
    name: "extra/modal/required-multi-selects@submit-errors",
    kind: "submit-errors",
    check: "modal submit with empty required fields: the errors show, and changed is true",
  },
  {
    name: "contexts/plain_text_input/modal-input@submit",
    kind: "probe",
    check:
      "modal submit probe: Actions Preview shows view_submission with the typed value in state.values",
  },
];

export interface VerifyItem {
  name: string;
  payload: unknown;
  probe?: Probe;
  kind: ItemKind;
  realInput: boolean;
  check: string;
}

/** The verification items, ready for capture.js: `{ name, payload, probe? }` plus what to check. */
export function verifyPlan(
  payloads: Map<string, unknown>,
  probes: Map<string, Probe>,
): VerifyItem[] {
  const items = VERIFY.map(({ name, kind, check }): VerifyItem => {
    const fixture = parseReferenceName(name).fixture;
    const json = payloads.get(fixture);
    if (json === undefined) throw new Error(`verify: no fixture ${fixture}`);
    const probe = probes.get(name);
    if (kind === "probe" && !probe) throw new Error(`verify: no probe ${name}`);
    return {
      name,
      payload: Array.isArray(json) ? { blocks: json } : json,
      ...(probe ? { probe } : {}),
      kind,
      realInput: REAL_INPUT.has(kind),
      check,
    };
  });
  return [...items.filter((i) => !i.realInput), ...items.filter((i) => i.realInput)];
}
