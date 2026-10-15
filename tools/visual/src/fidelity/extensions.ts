/**
 * The capture capabilities the inventory's `b` cells need (inventory.ts Capture), each with a short
 * design. None is implemented yet; generate.ts prints them with the number of cells each unlocks.
 */
import type { Capture } from "./inventory";

export interface Extension {
  capability: Capture["capability"];
  title: string;
  design: string[];
}

export const EXTENSIONS: Extension[] = [
  {
    capability: "real-input",
    title: "Hover, focus-visible and pressed states",
    design: [
      "Name: `<fixture>@hover-<n>`, `@focus-<n>`, `@press-<n>` in names.ts, where <n> picks the fixture's nth control of the kind (as OPENERS picks the first), so compare.ts can replay it with Playwright's real pointer and keyboard.",
      "A page script can't make :hover or :active match, and a scripted focus only sometimes matches :focus-visible. capture.js gets a `pointer` adapter: the session driving the maintainer's Chrome (the claude-in-chrome extension, or DevTools' CDP Input.dispatchMouseEvent / dispatchKeyEvent) moves the real pointer to the control, holds the button down for pressed, or presses Tab until the control has focus. capture.js already waits on `sbkCaptureReady`; the adapter sets it once the input is held.",
      "snapshot.js runs unchanged while the input is held; transitions get the same settle wait as @open.",
      "Verified in the first real Builder session: rest captures record their controls' state styles (3 differ from ours on extra/fidelity/button/long-content, 10 on extra/payloads/selects@mobile).",
      "Fallback where real input can't be held (pressed during a snapshot): derive the state's styles from the stylesheet rules (css-rules) and record them as style facts instead of a reference.",
    ],
  },
  {
    capability: "css-rules",
    title: "Style facts from Slack's stylesheets (state styles, keyframes)",
    design: [
      "capture.js already walks `document.styleSheets` (to detect repeated sheets). A new `sbkRules(element)` lists, for each captured control, the rules whose selector matches it once its state pseudo-classes (:hover, :focus-visible, :active, :disabled, [aria-*]) are stripped, and resolves their declarations against the element's computed style (var() substituted, colours as rgb()).",
      "Output: derived values only, never Slack's selectors or CSS text. A style fact is `{ component, state, theme, property, value, source: 'rule' | 'computed', captured }` in `fixtures/style-facts/<component>.json`, maintainer-owned like references and covered by the lock (hash of the facts plus the payload).",
      "Keyframes: for an element with `animation-name`, record the keyframe offsets' resolved values (opacity, transform) with the duration, easing and delay already in the meta's motion.",
      "Checked by a new interaction-test helper that asserts our computed value per fact, so the hand-written expected values in interaction.browser.ts can point at the facts file instead.",
    ],
  },
  {
    capability: "behaviour-probe",
    title: "Behaviour probes",
    design: [
      "A probe is a script of steps against the preview and the observations after each: `{ name, fixture, steps: [{ do: 'click' | 'key' | 'type' | 'hover' | 'wait', target?, key?, text?, ms? }], observe: ['focus', 'open', 'scroll', 'value', 'tooltip'] }`, kept in `tools/visual/src/fidelity/probes.ts`.",
      "Run in the Builder through the same real-input adapter; each observation records a role-based description (the focused element's role and accessible name, which layer is open, the scroll offset, the field's value, a tooltip's text and the time it took to appear), never Slack's DOM.",
      "Recorded as `fixtures/<fixture>@<probe>.behaviour.json`, maintainer-owned like payload recordings, and replayed by a test against our rendering in the interaction harness, as actionPayloads.test.tsx does for payloads.",
      "Covers: arrows, Enter, Space, Escape, Tab and typeahead in lists, menus and the calendar; what an outside click or scroll closes; where focus goes on open and close; tooltip show and hide delays.",
    ],
  },
  {
    capability: "unclipped",
    title: "Unclipped capture of wide content (`+full`)",
    design: [
      "Being added by the harness work: a reference of a block whose content is wider than the preview (a chart card's 400px minimum, a wide table, a long preformatted line), captured at its whole width as if the preview were wide enough.",
      "Covers the `full-content` cells of charts, tables, data tables, carousels, markdown and preformatted rich text.",
    ],
  },
  {
    capability: "scrolled-end",
    title: "Scrolled to the end (`@scrolled-end`)",
    design: [
      "Being added by the harness work: the block's horizontal scroller scrolled to its end before the snapshot, and the scroll range and minimum width recorded as behaviour, at mobile and desktop width.",
      "Covers the `scrolled-end` styles and behaviour cells of the same components.",
    ],
  },
  {
    capability: "validation-probe",
    title: "Validation states",
    design: [
      "A behaviour probe on a modal fixture: clear or fill the field (too short, out of range, malformed email or URL), press Submit, then snapshot as `<fixture>@invalid[+dark]`.",
      "First verify what the Builder's modal preview validates on its own; server-side errors (response_action: errors) need an app and stay unobservable.",
    ],
  },
  {
    capability: "actions-preview",
    title: "Payload recording coverage",
    design: [
      "Extend the recording convention to every event: `<fixture>@<interaction>.actions.json` holds whatever Actions Preview shows, keyed by its `type` (block_actions, view_submission, view_closed). The inventory already reads `type` to file a recording under its event.",
      "Plan one recording per interactive element per context (fixtures/contexts), so state.values shapes are known in messages, accessories, modals and App Home; actionPayloads.test.tsx compares view_submission state.values the same way it compares block_actions.",
      "Verify whether the Builder shows view_submission and view_closed (notify_on_close) at all; block_suggestion needs an options URL the Builder doesn't have.",
    ],
  },
];
