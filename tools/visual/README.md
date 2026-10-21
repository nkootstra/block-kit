# Visual comparison against Slack

Every fixture in `fixtures/` can have a `*.reference.html` next to it: a DOM snapshot of Slack's own
rendering, frozen from [Block Kit Builder](https://app.slack.com/block-kit-builder) with every
computed style inlined. `compare.ts` screenshots that snapshot and our rendering of the same payload
and pixel-diffs them.

## Compare

Start the playground, then run the comparison from the repo root:

```bash
bun run --cwd apps/playground dev
```

```bash
bun run compare
```

- `bun run compare -- catalog/container` compares only fixtures under a prefix.
- `--scale=2` renders both sides at twice the pixel density, for sharp images such as the landing
  page's comparison (`apps/site/src/assets/proof`, one set from `message/approval` and one from
  `message/approval@dark`, shown with the page's theme). Baselines are recorded at 1x, so it can't be
  combined with `--check` or `--update-baseline`.
- `bun run compare:check` fails when a fixture regresses past its baseline (0.5 pp tolerance).
- `--shard=2/4` compares one slice of the fixtures: every fourth one, starting from the second.
  CI checks a pull request in eight slices at once; a slice can't update the baseline.
- `--update-baseline` records the current mismatch in `fixtures/visual-baseline.<platform>.json`
  and the flagged text runs in `fixtures/text-baseline.<platform>.json` ([Text runs](#text-runs));
  `--update-baseline=lower` only adds new fixtures and lowers improved ones.
- `bun tools/visual/src/merge-baseline.ts --update-baseline[=lower] <report.json>...` records the
  baselines from the `test-results/visual/report.json` of every slice of a sharded run, as one full
  `--update-baseline` run would. It fails and writes nothing unless the reports hold exactly one
  result for every reference, so a missing slice can't drop fixtures from the baselines.
  `--platform=linux` picks the baselines to write when the slices ran on another platform.

Open `test-results/visual/index.html` for side-by-side reference / ours / diff images.

Fixtures only show sample images from `cdn.block-kit.dev/samples/` (see
[`fixtures/assets/samples/CREDITS.md`](../../fixtures/assets/samples/CREDITS.md)). The comparison,
the renderer and the interaction tests serve them from `fixtures/assets/samples/`
(`src/samples.ts`), also when a reference loads them through Slack's `slack-imgs.com` proxy, so
they never download them.

## Text runs

The pixel diff scores a whole fixture with a per-pixel threshold, so it can't see a colour a few RGB
steps off, a 0.5px border or a run that moved by a pixel or two. Every fixture therefore also gets a
text-run check (`src/textRuns.ts`):

1. Every visible text node on both sides becomes a run, positioned relative to the rendered root
   (`src/collectTextRuns.ts`). Text an ancestor with `overflow: hidden`, `auto` or `scroll` cuts
   off entirely (a time list's options scrolled out of its box) isn't on screen and isn't read;
   text an edge only cuts through still is.
2. Runs are matched in order by their text, with a longest common subsequence, so a run only one
   side has doesn't shift the rest.
3. Each pair is compared by position and width (±0.5px), font size, weight and style, and colour as
   painted: the colour, faded by the opacity of the element and its ancestors, blended over the
   background behind it. `rgba(29, 28, 29, 0.7)` on white and `#616061` count as the same colour.

Each line of the output ends with `text <matched>/<reference runs> matched, <n> flagged`, where every
differing property and every run only one side has counts once. A filtered run lists the flagged runs:

```text
  0.05%  extra/input/text-inputs  ref 510x304  ours 474x304  text 8/8 matched, 1 flagged
         color "We'll only use this for receipts.": Slack rgb(94, 93, 96), ours rgb(97, 96, 97)
```

`fixtures/text-baseline.<platform>.json` records each fixture's findings next to the pixel baseline,
one key per finding: `<property>|<text>|<occurrence>`, such as
`color|We'll only use this for receipts.|0`. The occurrence counts earlier runs with the same text,
and a run only one side has is keyed `missing` or `extra`.

- `--check` fails on any finding a fixture's text baseline doesn't list, even when the fixture also
  resolved another one, and reports the findings that disappeared. Layout is deterministic, so
  there's no tolerance.
- `--update-baseline` rewrites both baselines; `--update-baseline=lower` adds new fixtures and drops
  resolved findings, but never adds a finding to a fixture it already lists.
- `--text-baseline=<file>` checks against another file, as `--baseline` does for pixels.

### Motion

A frozen render shouldn't move, so `snapshot.js` keeps transitions, animations, `cursor` and
`pointer-events` out of the inlined styles. It records them in the reference's meta instead, under
`motion`, keyed by each element's `data-ref`. The text-run check compares the motion of the nearest
element that transitions or animates behind each matched pair (`transition <property> <duration>
<easing> <delay>`), on Slack's side from the meta and on ours from the computed style. Differences
show as `<n> moving differently` on the fixture's line and as `motion` lines in a filtered run:

```text
         motion "Save": Slack transition background-color 0.08s cubic-bezier(0.36, 0.19, 0.29, 1) 0s, ours transition background-color 0.15s ease 0s
```

Motion is reported only: it isn't a text-baseline finding and never fails `--check`. References
captured before snapshots recorded motion have no `motion` in their meta, and their runs aren't
compared.

`bun tools/visual/src/inspect.ts <fixture> [--ours]` prints a box-model tree, which is the quickest
way to read the exact paddings, line heights and colours Slack uses.

## Reference names: states, themes and widths

A reference is a fixture captured in one state (`names.ts`):

```
<fixture>[@<interaction>][+mobile][+full][+dark]
```

- **No suffix:** light theme, desktop width, nothing opened. These are the 123 catalog references.
- **`@<interaction>`:** captured after interacting with the preview. Fixture-specific ones
  (`@expanded`, `@sort-asc`, `@page-2`, and the `@pick` references recorded with Actions Preview,
  which repeat the package payload test's clicks) are listed in `states.ts`. A reference whose
  interaction has no replay fails `states.test.ts`: compare.ts would compare our rendering at rest
  with it. Three apply to any fixture and act on its _first_ control of the kind:
  - `@open`: the first select, multi-select, time list, datepicker, datetime picker or overflow
    menu, opened;
  - `@confirm`: the first button, with its confirm dialog open (put the `confirm` on it);
  - `@dialog`: a section accessory's multi-select, with Slack's selection dialog open.
- **`@hover-<target>`, `@focus-<target>`:** captured while real input holds one control: the
  pointer resting on it, or keyboard focus (so `:focus-visible` matches). `<target>` is a control
  address (below), such as `@hover-button-2`.
- **`@submit-errors`:** a modal submitted with its fields as the payload leaves them. Block Kit
  Builder doesn't validate a modal: it sends the `view_submission` with required fields empty and
  shows no errors, so this records the submit's behaviour and payload, not Slack's error styles.
- **`@scrolled-end`:** the first horizontal scroll container that overflows (a chart's card, a
  table, a carousel), scrolled fully to the right.
- A [behaviour probe](#behaviour-probes) with `"snapshot": true` names its reference after itself
  (`@submit-short`).
- **`+mobile`:** the Builder's Mobile preview; ours is rendered at that width.
- **`+full`:** the content its horizontal scroll containers hide, shown in full ([Wide
  content](#wide-content)).
- **`+dark`:** the Builder in its dark theme (recorded as `theme` in the reference's meta); ours is
  rendered with `theme="dark"` (`?theme=dark` on the playground's render page), on the reference's
  page background.

The suffix parts always come in that order (`@open+mobile+full+dark`), so each state has one name;
`import.ts` and `references:check` reject any other spelling.

**Control addresses** (`src/targets.ts`) point at one control on both sides: `<kind>-<n>`, the nth
control of the kind in document order, counting from 1. The kinds are `button`, `overflow`,
`field` (a select, multi-select, time list, date picker, or either half of a datetime picker; a
section accessory's multi-select too, which Slack draws as a button that opens the selection
dialog), `checkbox`, `radio`, `input` (plain text, number, email and URL inputs) and a modal's
`submit` and `cancel`. Each kind has a selector per side, and where a control matches more than once (a picker's
wrapper and its input) only the outermost match counts. An address counts controls rather than
naming them by role and accessible name: the payload fixes the number and order of controls on
both sides, while the names differ (Slack's static select is a combobox named after its
placeholder, ours a button) and texts change with the fixture. It extends `@open`'s "first control
of the kind" to any control.

The other kinds cover what isn't a form control:

| Kind                 | What                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `link`               | a mrkdwn, rich text or markdown link                              |
| `mention`            | a user, channel, user group or broadcast mention, resolved or not |
| `card`               | a card (its buttons are `button`s)                                |
| `arrow`              | a carousel's scroll buttons, left before right                    |
| `menu`               | the More actions trigger of an image block or a chart             |
| `column`, `page`     | a data table's sortable column header, and its pagination buttons |
| `more`               | a section's Show more toggle                                      |
| `action`             | a button in the message's hover toolbar                           |
| `option`, `menuitem` | an option of an open list, an item of an open menu                |
| `confirm`, `deny`    | the buttons of an open confirm dialog                             |
| `richtext`, `file`   | a rich text input's editor, a file input's button                 |
| `icon`, `feedback`   | an icon button; each of a feedback pair, positive first           |
| `collapse`           | a collapsible container's header                                  |
| `pill`, `task`       | a plan's or task card's status pill; a plan's task header         |
| `source`             | a plan's or task card's source link (once expanded)               |
| `contact`, `expand`  | a contact card; an image block's title toggle                     |
| `sender`, `time`     | the message header's app name and time                            |
| `scroller`           | a block that scrolls itself (below)                               |
| `video`              | a video block's player (the play overlay)                         |
| `chip`               | a multi-select's chosen option, as a token in the field           |
| `tooltip`            | a tooltip showing, after a hover; counted in the open layers      |

`scroller` isn't a class: it's any element whose content overflows the way it scrolls
(`overflow-x` or `-y` `auto` or `scroll`), found by its computed style on both sides, which is what
a carousel, a data table and a wide table or chart have in common. A file block has no actions in
either rendering, and legacy attachments' links are `link`s on ours; no reference shows Slack's
attachments yet.

A tooltip doesn't take the pointer (ours has `pointer-events: none`), so hovering one never
matches `:hover`: hover its trigger, then address the tooltip (`tooltip-1`) to snapshot or observe
it. A probe snapshot taken after a hover keeps the pointer there, also when a wait or a key comes
between them (hover, wait for the tooltip, snapshot); a click or a scroll after the hover moves it
away as usual. `compare.ts` counts ours (`.sbk-tooltip`) with the popovers, as Slack's capture
counts its own (`catalog/agents/message-feedback@tooltip-over-icon-1`).

`option`, `menuitem`, `confirm`, `deny` and `tooltip` are counted in the open layers rather than the message,
in page order: both sides portal them out of the message, and only the open layer has any. An
alert block has no close button in Block Kit Builder's preview, so its links are `link`s and
nothing else of it is addressable. Block Kit Builder shows neither a section's Show more (not
even for a 980-character section) nor a message hover toolbar, so `more` and `action` can't be
captured there; their Slack selectors stay guesses (targets.ts `UNVERIFIED`), and ours doesn't draw
the toolbar yet. The Builder draws the message header's `sender` and `time` as plain text, which
takes no focus (targets.ts `UNFOCUSABLE`): a `@focus-sender-1` stops with "can't take focus", and
the capture plan doesn't ask for one. A plan and a task card start collapsed on both sides, so
their sources, task headers and the links in their text exist only after a click on the `pill`:
a probe clicks it first (`{ "click": "pill-1" }`), and the plan proposes
`@expanded-hover-<target>` probes rather than plain hover or focus captures of them. A section
accessory's multi-select opens a dialog that takes the focus, with its field at rest; a probe that
reaches its options clicks the dialog's field next (`{ "click": { "role": "combobox", "name":
"<placeholder>" } }`), which opens the list.

A probe that picks from a users or conversations select types a filter first (`{ "type":
"slackbot" }` after opening it): the list's first entry is the person signed in to the Builder,
and `references:check` refuses a probe that would pick it. During a run `capture.js` keeps the
operating system's file picker from opening (a click on a file input or its label,
`input.click()`, `showPicker()`); Slack's file input opens its own "Add file" dialog instead.

A probe can fill a required rich text input (`{ "click": "richtext-1" }`, then `{ "type": "…" }`),
but not a file input, whose button opens the operating system's file chooser, or an external
select, whose options come from an app's options URL that Block Kit Builder doesn't have.

**Real input.** `compare.ts` holds the same input on ours: Playwright's pointer rests on the
control through the screenshot, or the control gets focus the way the capture gave it (a scripted
focus, after one Tab press when that isn't keyboard focus). A held reference records the input in
its meta (`input`), its controls' `data-ref`s (`targets`) and, as every snapshot does, its motion.

### Wide content

A data visualization's card is at least 400px wide; in the 320px of the Builder's Mobile preview
its scroll container (`overflow-x: auto`) shows only the first 320px, and a table or carousel can
do the same. Three things cover what a frozen snapshot can't scroll to:

- **Scroll facts.** Every snapshot records each horizontal scroll container in the preview, in
  document order, in the meta's `scrollers`: its `data-ref`, `scrollWidth`, `clientWidth` and
  `scrollLeft`. `compare.ts` scrolls the reference's frozen copy back to `scrollLeft`, and for a
  rest reference pairs the containers that overflow with ours, in order, and reports where the
  content or visible width differs by more than a pixel, or where only one side scrolls, as
  `scroll` lines (reported, like motion).
- **`+full`.** `capture.js` widens the preview by the most any of its containers hides, expands any
  container that still overflows (one with a width of its own) to its content, snapshots, and puts
  the page back. The meta records the widened width and `full: { widenedBy, expanded }`. Ours is
  rendered at the reference's width, and any container still overflowing is expanded the same way
  (`src/scrollers.ts`). The rest of the message lays out at the wider width on both sides, so the
  two stay comparable. It's a modifier rather than an interaction because it's a layout of the same
  state, like `+mobile`: `@mobile+full`, `@scrolled-end+mobile+full+dark` are all valid.
- **`@scrolled-end`** shows where the content ends and what Slack draws at the end (a carousel's
  arrows).

**State styles.** A rest capture also records, for every control, what its `:hover`, `:active`,
`:focus` and `:focus-visible` rules change, as resolved values in the meta's `stateStyles` (keyed by
`data-ref`, with the address). A page script can't make `:active` match, and a pressed button can't
be held through a snapshot, so `snapshot.js` emulates the states: each rule with a state
pseudo-class gets a copy right after it in its sheet, with the pseudo-class swapped for an
attribute of the same weight (`[data-sbk-state~="active"]`), and the attributes go where the
browser would match (the control and its ancestors for hover and active; focus-within on the
ancestors for focus). The cascade then resolves as it would in that state, against every competing
rule; only the properties that change are kept, never Slack's CSS text, and the copies are removed.
`compare.ts` forces the same states on our control (`CSS.forcePseudoState` over the DevTools
Protocol, `src/stateStyles.ts`) and reports the differences as `state` lines, like motion: never a
baseline finding.

**Open states.** `snapshot.js` also freezes every open Slack popover or dialog it finds in the
Builder's `.ReactModalPortal`, and records each in the meta's `layers` (`kind`, and its box relative
to the preview):

- A **popover** (a select list, the calendar, the time list, the overflow menu) is placed in the
  reference where it sat relative to the preview, and the page is padded so one that sticks out to
  the left of the message still fits. `compare.ts` crops both sides to one box, relative to the
  message, that holds both sides' message and popovers (`layout.ts`), and moves our message away
  from the window's edge so our popover isn't pushed inward. A popover a few pixels off shows as a
  diff instead of shifting the whole image. The text check reads the popover's text too. Slack's
  calendar marks the capture day as today, so `compare.ts` renders ours with the page's clock set
  to that day (the `--is_today` date's `data-value`), not the day the comparison runs. A
  datetimepicker fills in the time of day when a date is picked, so a reference with one gets the
  capture time (the meta's `capturedAt`) instead. The comparison runs in UTC, so ours shows that
  time in UTC, not in the zone it was captured in, but the same on every run.
- A **dialog** (a confirm dialog, the multi-select dialog) is centred in the window, so its position
  says nothing; it's compared on its own, against ours (`.sbk-confirm`, `.sbk-select-dialog`). A
  popover open over a dialog (the multi-select dialog's list) is moved into the dialog's layer at
  its offset from the dialog, and compared with the dialog alongside our list.

## Capture new references

1. `bun tools/visual/src/bundle.ts [prefix...] | pbcopy` copies the fixture payloads.
2. In Block Kit Builder (Message Preview, Desktop, the theme you start in doesn't matter), paste
   `snapshot.js` and `capture.js` into the page verbatim. The Builder's CSP blocks `eval`, so they
   can't be fetched and evaluated:

   ```js
   window.sbkSnap = /* contents of snapshot.js */;
   window.sbkCapture = /* contents of capture.js */;
   const refs = await window.sbkCapture({
     items: [{ name: "catalog/actions/datepickers@open+dark", payload: /* from bundle.ts */ }],
     snap: window.sbkSnap,
   });
   ```

   For each item, `capture.js` switches the theme and preview width the name asks for, loads the
   payload (switching the surface when needed), waits for the preview to settle, performs `@open`,
   `@confirm` or `@dialog` on the first control of the kind, waits for transitions to finish,
   snapshots, and closes what it opened. When a scripted click doesn't open a control, or the
   interaction is fixture-specific, it waits: `window.sbkCaptureWaiting` names the item. Perform it
   with a real click and set `window.sbkCaptureReady = true`. A typed-into select (`c-select_input`)
   always asks for a real click to open, then for the pointer to move away: a scripted press
   doesn't focus it, so the open field lacks its focus ring, and leaves a chosen option in the
   field where a click empties it to the placeholder. Before a held hover, and before a rest
   capture, the run blurs whatever the Builder left focused in the preview. Transitions advance
   only while the page renders frames, and a Chrome window covered by another one renders about one
   in 500ms while still reporting itself visible and focused: an open select's focus ring then
   stays at its transparent start. So right before each snapshot the run waits for the page to have
   focus and render (`window.sbkCaptureWaiting` asks for it: bring the window to the front,
   uncovered, without clicking the preview), and stops if it lost focus during one.
   Block Kit Builder keeps an element's state across payloads, by block and action id: a
   multi-select's chosen "Red" stayed in every later payload with the same ids, even one whose
   options don't have it. So `capture.js` first loads a neutral payload of the item's surface (one
   divider), which unmounts every element, before any payload with interactive elements, and after
   loading checks what the preview shows against what the payload sets: multi-select chips, text
   input values, checked boxes and radios. A difference is retried once through the neutral payload;
   then the run stops: reload the Builder and resume. What was captured is kept: besides
   `window.sbkCaptureOutput`, each reference, payload and behaviour recording is written to the
   page's IndexedDB (database `sbk-capture`, store `records`, one record each) as it's recorded, and
   the item's writes are awaited before the next item starts. The first call after a reload picks it
   all up again; in a fresh tab, `await sbkCapture({ items: [] })` (or `sbkCaptureRestore()` once
   capture.js has been called) restores it, and `sbkCaptureJson()` returns it. A failed write sets
   `window.sbkCapturePersistError` and is logged in the console: check it during a long run.
   `sbkCaptureReset()` clears both copies.
   `references:check` fails on a reference that shows chips or input values its payload doesn't set
   (`stale.ts` `foreignState`), for the rest state and the generic states (`@open`, `@confirm`,
   `@dialog`, held input, `@scrolled-end`); a section accessory's multi-select counts its choices on a
   button and shows no chips.

A multi-select that shows chips didn't open its list in the Builder, not on a scripted press, a
click or ArrowDown. `@open` on one asks for a click past the chips (at the field's empty end), then
a typed letter, and stops after 30 seconds (`chipTimeout`) with a message to capture its `@open`
from a payload without initial options.

The preview must be at its full width (a message 512px, 400px in Mobile): use a 1440px window
and the Builder's default split. The Builder remembers the split in `localStorage` `bkb_layout`;
with a narrow code pane (`codePaneRatio` 0.32) a desktop message was 660px wide, which `capture.js`
refuses. Reset it with `localStorage.setItem("bkb_layout", JSON.stringify({ codePaneRatio: 0.5 }))`
and reload.
Keep the Builder tab visible: macOS pauses a hidden tab and the preview never settles. When the
run is done, switch the Builder back to light.
Paste the scripts into a freshly loaded Builder. Late in a long session the Builder can load a
stylesheet that repeats rules it already has, which reorders the cascade (it once shifted every
datetime picker 8px). `capture.js` inventories the page's stylesheets on its first call and
keeps every rule a later sheet repeats as a suspect. A repeat only matters where it changes a
style, and rendering a chart on a fresh load brings a sheet that repeats hundreds of the message
chrome's rules, so before and after each snapshot (also for `+full`) the suspects that match an
element in the preview or an open layer are taken out for a moment, and the properties they set
are read on those elements without them and with them, transitions off. The capture stops only
where a value differs, naming the first changes (`selector { property: fresh -> now }`), and
keeps stopping until the Builder is reloaded: reload, paste the scripts again and resume from
the item it names. A repeated rule for a pseudo-element (`::before`) isn't checked.
A fixture that needs a real workspace file (`slack_file`) carries the placeholder file URL
(`https://files.slack.com/files-pri/T0000001-F0000001/file`). Map it to the file's link in
`tools/visual/capture.local.json` (`{ "<placeholder>": "<link>" }`, ignored by git) and pass
that object as `substitute`: only the Builder sees the link, and `import.ts` redacts it again.
The comparison serves `fixtures/assets/slack-file.png`, a copy of that file, for the placeholder
to both sides.

3. Copy the resulting `refs` JSON and write it to `fixtures/` with
   `pbpaste | bun tools/visual/src/import.ts`, or pass `download: "<session>"` and import the file
   the Builder saves: `bun tools/visual/src/import.ts ~/Downloads/block-kit-refs-<session>.json`. The
   file holds everything the run recorded (`{ references, actions, behaviour }`, also on
   `window.sbkCaptureOutput`); a run that stops on an error saves what it has as
   `block-kit-refs-<session>-partial.json`.

### Captures that need real input

Hover, keyboard focus and probe steps need input a script can't fake. Start the run without
awaiting it, paste `observe.js` too for probes, and follow `window.sbkCaptureWaiting`:

```js
window.sbkSnap = /* snapshot.js */;
window.sbkCapture = /* capture.js */;
window.sbkObserve = /* observe.js */;
window.sbkCapture({ items, snap: window.sbkSnap, observe: window.sbkObserve, download: "s1" });
```

`sbkCaptureWaiting` is an instruction while the run waits, `undefined` otherwise:

| `do`        | What to do                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- |
| `hover`     | Move the pointer to `x`, `y` (viewport CSS pixels; `box` is the control) and leave it there |
| `move-away` | Move the pointer off the preview                                                            |
| `key`       | Press `key` once (`Tab` for focus: anywhere, the run focuses the control itself afterwards) |
| `click`     | Click at `x`, `y`                                                                           |
| `type`      | Type `text` into what has focus                                                             |

The run sees the input take effect (the control matches `:hover` or `:focus-visible`, a trusted
click or key press arrives) and continues by itself; no flag to set. It checks a held state still
holds after the snapshot and stops with an error when it doesn't. A pressed state (`:active`) can't
be held this way: it's recorded as state styles instead. `real: false` dispatches scripted events
for clicks, keys and typing instead (a quick run; React's handlers see them, the browser's default
actions don't).

A hover counts only once the pointer moves onto the control after the instruction appears (a
pointer resting there from an earlier item doesn't), and on the control or any wrapper drawing the
same box (a time picker's value is an overlay beside its input). A click counts when the press went
through the control (as it was when pressed: a feedback button swaps its icon on the press), a
wrapper drawing its box or the select or picker field around it (a time picker's overlay and
chevron, a date picker's calendar button), or landed inside the instruction's `box` whatever was on
top there: an open menu's overlay that takes the click is Slack's behaviour, and the probe records
it. A `type` step counts once the field reads the text or the keys were typed, so typing that
closes a list half way (a space picks the highlighted option in Slack's static select) doesn't
stall the run. A control that renders a moment after the preview settles (a contact card) gets
`lookup` ms (5000) to appear before a step that addresses it fails. Every wait is bounded: an
instruction not done within `timeout` (120 s) fails the item, and a preview that doesn't settle
within 60 s fails it with what it last saw. Every wait leaves out the time the
tab was hidden, counted from `visibilitychange`, since a hidden tab's timers barely run. A tall
payload gives the preview pane a scrollbar that takes 8px off the message; it's hidden while the
preview is frozen, so the message keeps its full width.

A driver can wait for the next instruction instead of polling:
`await sbkAwaitInstruction(prevSeq, timeoutMs, scale)` resolves with `{ seq, instruction, screen }`
(the instruction's `x`, `y` and `box` times `scale`, for screenshot coordinates such as 1412/1440),
with `{ done: true, error }` once the run finished, or `{ timeout: true }`. Pass the `seq` it
returned as `prevSeq` next time; every instruction carries its `seq` too (`key` stays the key to
press). A plain-string instruction arrives as `{ do: "manual", name }`.

`capture.js` also reads Block Kit Builder's Actions Preview for every probe step, `@submit-errors`
and fixture-specific interaction, and records a new payload under the interaction. Actions Preview
is a tab next to Payload in the right pane (`role="tab"`, matched by its text) that must be selected
to show; it holds one CodeMirror with only the latest payload (`{}` before the first), updated a
moment after the interaction. The run selects it before the first step (and gives the focus back),
selects Payload again before loading the next payload, and polls for a change for up to 2 seconds.
Actions Preview keeps showing the last payload until the next one, and one can land late, so each
item first waits for the preview to stop changing and takes that as its baseline: a payload
counts only when it differs from the text before its step and from that baseline, never the
previous item's.
Held states (hover, focus) and `@open`, `@confirm` and `@dialog` never switch tabs. `actions`, a
function returning the preview's text, replaces the reader.

A runner that calls `sbkCapture` once per item gets everything kept across the calls in
`window.sbkCaptureOutput` (`window.sbkCaptureReset()` starts over; the old `reset: true` option
refuses, so a runner can't drop its output by passing it on every call), and `window.sbkCaptureJson()` returns it as
pure-ASCII JSON to copy through the clipboard (`navigator.clipboard.writeText(sbkCaptureJson())`,
then `pbpaste | bun tools/visual/src/import.ts`). A hidden tab pauses the waits' timeouts as it
pauses the preview.

Nothing the run clicks may navigate: in the Builder a button or link with a `url` opens a new tab.
During a run `window.open` does nothing and a click on a link in the preview or a layer has its
default prevented; the link's handlers still run, so Actions Preview still gets its payload. A
probe step that clicks a button the payload gives a `url` stops the run unless `allowUrls: true`:
holding `window.open` off only works where the scripts run in the page's own world.

## The Builder workspace stays out of git

A capture shows whatever the Builder's workspace holds: an opened users, conversations or channels
select lists its real members (names, avatars, user IDs) and channels, and every snapshot records
the workspace's team ID and name. `import.ts` and `renormalize.ts` replace them through
`normalize.ts` with stable placeholders (`redact.ts`): members become "User One", "User Two"…,
channels "channel-one"…, the workspace "Workspace", avatars a grey pixel, profile links `#`, Slack
files (`files.slack.com`, `slack-files.com` and permalink URLs, also URL-encoded inside a proxy's
`url=`) `https://files.slack.com/files-pri/T0000001-F0000001/file`, the workspace's own subdomain
`workspace.slack.com`, and Slack IDs (`T0…`, `U0…`, `C0…`, `F0…`) short placeholders such as
`U0000001`. IDs the fixture's own payload uses
(`U0123456789`) are kept. Slack marks all of these up, so no list of real names is needed; a name
that only appears as plain text goes in `tools/visual/redact.local.json`
(`{ "Real name": "Placeholder" }`), which is ignored by git. The snapshot froze each name's
element at the real name's width, so redaction also releases the width, `flex-basis`, `max-width`
and `min-width` on a placeholder's own element and on a wrapper holding only it; the placeholder
lays out at its own width, and whatever follows it (a presence dot) moves with it.

The Builder lists members and channels by the workspace's recent activity, so the order of an
open list, and which of its channels are private, differ between capture sessions. Redaction
numbers them by their Slack ID rather than by where they appear: the signed-in member is
"User One", the rest follow in the order of their IDs, and `import.ts` reads the IDs from every
reference of the capture first, so a picked token without an ID, or a list showing only some of
them, gets the same placeholder as the open list. The IDs are only held in memory while
importing. References captured before this numbered members as they appeared, and nothing in them
says who is who any more, so they keep their numbering until they are captured again. The comparison reads both from the reference's open list
(`directoryOrder.ts`) and passes them to the render page as `&directory=User One,channel-one:private,…`,
which lists its placeholder directory the same way.

`references:check` fails on a reference that still contains a member, channel or workspace name,
an avatar URL, a profile link, a file URL, the workspace's subdomain, or a Slack ID its fixture
doesn't use.

## Elements in every context

`fixtures/contexts/<element>/<context>.json` holds each interactive element in every place Slack
allows it: `actions` (an actions block in a message), `accessory` (a section's accessory),
`modal-input` (an input block in a modal) and `home` (an actions block on App Home). They're
generated from `contexts.ts`, which lists the elements and where Slack allows each, from Slack's
Block Kit reference; `bun tools/visual/src/contexts.ts` rewrites them, and `contexts.test.ts` fails
when they drift. They're captured and compared like any other fixture. The generator only writes
and deletes the fixture JSON; a reference left without a fixture is dropped through the lock.
Block Kit Builder refuses a multi-select in an `actions` block (in a message and on App Home) and a
datetime picker as a section accessory, and keeps showing the previous payload, so those pairings
are left out.

## Coverage

`bun run coverage:visual` prints how far the references go: for every fixture, which of the states
it should be compared in have a reference (light, `+mobile`, `+dark`, `+mobile+dark`, `@open`,
`@confirm` or `@dialog` in both themes where its controls have them; `@mobile+full` and `@scrolled-end+mobile` for a message with a chart,
a table or a carousel, `@full` for such a modal or App Home), and which interactive fixtures have a
payload recording. Real-input states are counted on their own (`@hover-<kind>-1` and
`@focus-<kind>-1` for the first control of each kind), as are behaviour probes without a
recording. CI adds it to the `check` job's summary; it reports and doesn't fail yet.

`snapshot.js` inlines each element's computed styles, with a few corrections so the frozen copy
lays out like the live page:

- **Widths are all frozen,** rounded up to the next 1/64px layout unit. A width serializes to six
  significant digits ("100.062px" for 100.0625), and a label sized to its text would wrap a hair
  short. Leaving content-sized widths to the replay is worse: it changes what the boxes beside them
  shrink and grow to, so a checkbox label's text lost 4px and wrapped.
- **A flex item in a row is pinned** to its frozen width (`flex: 0 0 <width>`), so the rounded-up
  row can't squeeze a tight item and an item with its own `flex-basis` doesn't ignore its width.
- **A wrapping flex row gets one more layout unit per item.** Chrome sizes such a row from its items'
  unsnapped widths, so live it can be a unit narrower than its snapped items and still hold them on
  one line; frozen, Slack's third action button dropped to a second line.
- **Heights are frozen, except where a set height would stop margins collapsing:** a block in
  normal flow, at `auto` (read through CSS Typed OM), whose first or last child's margin collapses
  through it. Leaving every `auto` height out is wrong elsewhere: Slack's checkbox wrapper, a flex
  item, was 14px live and replayed 20px tall around its 14px box and 3px margins.
- **The message time isn't pinned:** the capture writes `12:00 PM` over the time on screen, which
  would otherwise wrap in the narrower time's width.
- **The Builder's drag wrapper isn't in the motion:** its selection-highlight transition is the
  Builder's, not Slack's.
- **Grid track lists keep their authored form** (`auto auto`): the resolved list also contains the
  implicit rows, which would push an item placed after the grid one row down.
- **Tag defaults are read at the element's font size.** A style equal to its tag's default is left
  out, but many defaults are em-based: an `<hr>`'s 8px margin matched the default at the probe's
  16px and replayed as 7.5px at Slack's 15px.
- **The root writes down what it inherits** (Slack's font), since it replays in a bare page.
- **A field's placeholder keeps its colour** in a `::placeholder` rule, which an inline style can't
  set. A reference captured without it draws every placeholder in Chrome's grey,
  `rgb(117, 117, 117)`, in either theme: a little lighter than Slack's light one, `rgb(94, 93, 96)`,
  and darker than its dark one.

`src/snapshotReplay.browser.ts` checks all of this without the Builder: our own rendering of every
fixture is snapshotted the way the capture loop does it, replayed, and every element must land
within 0.5px of where it was live. `src/snapshot.browser.ts` holds the small reproductions.

Snapshots are normalized (`normalize.ts`) so timestamps, avatars and generated ids don't produce
noise. After adding a normalize rule, run `bun tools/visual/src/renormalize.ts` to rewrite the
committed references.

## Fidelity inventory

`bun tools/visual/src/fidelity/generate.ts` goes further than the coverage report: it lists every
fact about Slack that the package has to match, and what already records each one. A fact is a
cell:

```
<component> × <state> × <theme> × <width> × <fact kind>
```

- **Components** (`src/fidelity/components.ts`): every block, element and composition object in
  Slack's Block Kit reference, the blocks Block Kit Builder's catalog adds, the surface chrome (the
  message header, a modal's frame, App Home) and the client UI the package draws like Slack's
  (tooltips, Show more, the selection dialog). Each entry says how to find it in a fixture payload,
  where the package implements it and what the Builder can't show of it.
- **States** (`src/fidelity/axes.ts`): only those a component has, from `default`, `hover`,
  `focus-visible` and `pressed` to `open`, `validation-error` and `many-items`.
- **Themes and widths:** light and dark, desktop and mobile. Only styles vary by them, and only
  components that go in a message have a mobile width.
- **Horizontal overflow:** blocks whose content can be wider than the preview (charts, tables,
  data tables, carousels, markdown, preformatted rich text) also have `full-content` (captured
  unclipped, `+full`) and `scrolled-end` (scrolled sideways to the end, `@scrolled-end`), whose
  behaviour cells (does it scroll, from what minimum width) have a width too.
- **Fact kinds:** `styles`, `motion`, `behaviour` and `payload`, whose cells name the payload type
  (`block_actions`, `view_submission`…) instead of a state.

A cell is covered by a reference that shows the component in that state (the payload states, such
as an initial value, read from the fixture; `@open` only for the fixture's first control that
opens), by the motion in a reference's meta, by a payload recording of the element's action, or by
an interaction test. `src/fidelity/interactionTests.ts` maps each group of interaction tests to the
facts it asserts against Slack; the generator and `inventory.test.ts` fail when that mapping and the
test file's groups drift apart, and the test fails when the package renders a type the inventory
doesn't list.

Every uncovered cell says how Block Kit Builder could capture it: **a**, the existing flow (a
reference, a fixture-specific state, Actions Preview); **b**, a capture capability that doesn't
exist yet (real hover, focus and press, behaviour probes, style facts from Slack's stylesheets,
validation probes; `src/fidelity/extensions.ts` sketches each); or **c**, not observable in the
Builder, with the reason. It also says when a fixture payload has to be written first.

It writes `test-results/fidelity/inventory.json` (every cell, with its evidence) and
`inventory.md`: totals by fact kind, state, theme, width and kind, the components Slack documents
that the package doesn't implement or no fixture shows, and the uncovered cells grouped into capture
batches, most valuable first. The output is derived from the repository, so it isn't committed. It
reports; it doesn't fail.

`--discovery <discovery.json>` adds a second discovery source: the rules of Block Kit Builder's
stylesheets, as `[{ selector, pseudo, properties, direct, media?, keyframes? }]` with property names
only (`src/fidelity/stylesheet.ts` refuses a rule that could carry a value). Each rule's classes map
to components by their BEM block (`c-select_input`, `c-menu_item`, `p-rich_text_list`…), and its
pseudo-classes, state modifiers (`--highlighted`, `--disabled`, `--loading`) and attributes name the
state, so states Slack's classes have and the docs don't mention become cells with origin
`builder-css`. A rule that styles a Block Kit class inside other client UI (a date field in a List's
row) is out of scope. The report lists the families no component maps, for review, and the
out-of-scope ones with the reason. The discovery is read from the Builder and stays out of the
repository: pass it from wherever it was saved.

It also writes `test-results/fidelity/capture-plan.json`, with a section in `inventory.md`: every
capture the harness can make that covers an uncovered cell, each as its name for `capture.js` and its
fixture path, chosen so each covers as many uncovered cells as possible. There is one session per
surface, theme and width, holding every kind of capture: plain references (which also record
their controls' state styles and scroll containers), `@open`, `@confirm`, `@dialog`, `+full`,
`@scrolled-end`, then, marked as needing real input, `@hover-<target>`, `@focus-<target>`,
`@submit-errors`, fixture-specific states and behaviour probes (`<fixture>@<probe>.probe.json`,
which also record the Actions Preview payload). New captures come before recaptures of existing
references. The references `coverage:visual` expects and doesn't find are in the plan too. Cells
no fixture can show get a proposed fixture path under `fixtures/extra/fidelity/`, and cells no
capture kind reaches yet are listed with the reason. Behaviour cells no probe reaches get a
proposed probe spec (`probeProposals`: hover, click and Escape on the component's first control
address, or open a layer first, or scroll a long list), to write next to the fixture and re-plan.
Nothing is written to `fixtures/`.

`test-results/fidelity/verify-plan.json` is a short session to run first: one capture of each
kind (plain, `@open`, `@scrolled-end`, `+full`, `+mobile+dark`, `@hover-…`, `@focus-…`, the two
unverified selectors, probes with a payload, `@submit-errors`, a modal submit), in the order to run,
real input last, each with what to check. Its `items` are capture.js items as they are.

`fixtures/extra/fidelity/<component>/<state>.json` holds the fixtures written for the inventory:
each exists to show that component in that state (`static-select/many-items`,
`rich-text-user/mixed`), and the inventory counts its references for that state even where the
payload heuristics can't read it. The `rich-text-*` fixtures for the elements in Slack's reference
that the package doesn't render yet (`citation`, `canvas`, `tag`…) render nothing in ours until
they're implemented; their references record what Slack shows.

`src/fidelity/limits.ts` holds Slack's documented payload limits (an option's text is at most 75
characters, a placeholder 150…). Block Kit Builder refuses a payload past one and keeps showing the
previous payload, so `limits.test.ts` checks every fixture against them before it reaches a capture
session. Each limit names the fixtures the Builder was seen to refuse, and the ones it accepted
past the limit, as evidence.

Package bugs and harness gaps noticed while gathering facts go in `src/fidelity/findings.ts` and
show in `inventory.md` under "Findings (to fix later)": every fact is gathered before anything is
fixed.

Disabled states are not applicable (Block Kit can't disable an element) except a modal's
`submit_disabled` and a chart menu's Copy as image; they're left out of the totals.

`+mobile+dark` cells are captured like any other reference: the Builder's theme toggle and its
Desktop/Mobile select are independent. They keep a `verify` flag until the first such capture
confirms the Mobile preview follows the dark theme.

## Keeping references factual

A reference is only worth comparing against while it shows what Slack renders for the fixture's
current payload. `fixtures/references.lock.json` records, for each reference, a hash of the payload
it was captured from, a hash of its HTML and the capture date. `import.ts` and `renormalize.ts` keep
it up to date, and `bun run references:check` (part of CI) fails when:

- a fixture's payload changed since its reference was captured: recapture it;
- a reference's HTML was edited by hand: express the change as a normalize rule instead;
- a reference isn't in the lock file, or the lock file lists one that no longer exists;
- a reference shows text another fixture's payload writes and its own doesn't (`stale.ts`): Block
  Kit Builder refused the payload and kept showing the previous one, while the snapshot still
  recorded the refused payload from the URL. The same goes for a reference that shows not one word
  of its own payload's sentences (a confirm dialog's text aside, which waits for a click).

It also fails when a fixture, a doc, the landing page, the playground or a package test shows an
image that isn't a committed sample on `cdn.block-kit.dev` or on a placeholder host.

A fixture without a reference is listed but doesn't fail; it just isn't compared yet.

References, the lock file and the baselines are owned by the maintainers (`.github/CODEOWNERS`).
Contributors add or edit fixture payloads and leave the rest to a maintainer, who captures the
references in Block Kit Builder.

## Baselines in CI

The Visual workflow keeps the Linux baseline without anyone editing it by hand:

- A pull request is compared only when it touches something the comparison renders: the package,
  the playground, `fixtures/`, `tools/visual/` or the dependencies. Otherwise the comparison is
  skipped, which counts as passing.
- The fixtures are compared in eight parallel `compare-shard` jobs (`--shard`), about 7
  minutes each instead of about 50 in one; each spends a few minutes installing and starting the
  playground, so more slices save less. The `compare` job, the check the ruleset requires, passes
  when all eight did and fails when one failed. A run superseded by a newer push or label is
  cancelled, and its `compare` is skipped rather than failed; the newer run reports the check.
  Every label a person adds or removes compares again, whichever label it is: GitHub reads the
  required check from the head commit's latest run of the workflow, so a label's run that left
  `compare` out blocked the merge, and one that skipped it would turn a failed comparison green.
  The Labeler's labels don't start a run. A manual run compares every fixture in one job.
- A pull request is checked against the **base branch's** baseline, so it can't loosen its own
  check. A fixture with no entry yet is reported, not failed. A maintainer accepts a deliberate
  regression with the `visual-baseline-increase` label.
- After a merge, the workflow records the new numbers on `main` and commits them: new fixtures and
  improvements beyond the tolerance always, increases only when a PR merged since the last recorded
  run carried the label. The slices only measure and upload their `report.json`; once all eight
  succeeded, the `record` job merges them with `merge-baseline.ts`, which refuses unless they cover
  every reference, then commits both baselines in one commit on top of `main` as it is then, so a
  run that waited behind another builds on the baseline that one committed. If a slice fails,
  nothing is recorded and the next push records it. `record` pushes with the `VISUAL_DEPLOY_KEY`
  deploy key, which the `protect main` ruleset lets bypass the pull request requirement. CI runs on
  that commit, so a release can be cut from it; the Visual workflow ignores it, since only the
  baseline changed.
- Runs on `main` queue up and are never cancelled once they start. While one runs, a newer push
  replaces a run that is still waiting, so that run's PR is never measured on its own. That is why
  `record` looks for the label on every PR merged since the last successful run on `main` (up to
  100 merges), not only the one it measures: an increase accepted in a replaced or failed run is
  still recorded.
- Running the workflow manually with `update_baseline` regenerates the whole file as an artifact.

`visual-baseline.darwin.json` is for local runs only; keep it current with
`bun run compare -- --update-baseline`.

## Render diff

`src/render/` renders fixtures with a build of the library and compares two builds, so a pull
request shows how it changes what users see. Unlike `compare`, it needs no playground: it bundles
the library's source into a blank Chromium page.

```bash
git worktree add --detach ../block-kit-main origin/main
(cd ../block-kit-main && bun install)
bun run --cwd tools/visual render:diff --base=../block-kit-main/packages/block-kit [prefix...]
```

Every fixture renders in light and dark with both builds. Only the renders that differ are written
to `test-results/render-diff/` as `<fixture>.<theme>.{before,after,diff}.png`, listed in
`manifest.json`. The diff aligns rows first, the way a text diff aligns lines, so content that only
moved doesn't count as changed.

Renders are deterministic: the message time, time zone and locale are pinned, the fonts are
embedded, and a fixture's images are replaced by striped placeholders of the same size. The real
images never show, because renders end up public; only their size is read. Emoji are the exception:
the library draws them from a fixed, version-pinned set, so a payload can't choose what they show.

`bun run --cwd tools/visual test:browser` runs the tests that need a browser, including the
interaction tests below (`bunx playwright install chromium firefox webkit`); `bun run test` runs the
rest. In CI they run in the `Browser tests` jobs, one per engine, next to the `render-diff` job
rather than before it; none of them is a required check.

## Interaction styles

jsdom doesn't load the stylesheet, so the package's unit tests can't see how a control looks while
it's hovered, pressed, focused or animating. `src/interaction/interaction.browser.ts` checks that in
Chromium, Firefox and WebKit: `src/interaction/harness.ts` bundles the library's source like the
render diff does, draws a payload in a blank page, and drives it with a real pointer and keyboard.
Each case asserts a computed style or a painted pixel against Slack's value, such as the grey of a
pressed select, the red focus ring of an invalid input or the 80ms curve of a button. It also
covers rendering no reference can show, such as a non-square card icon, which Slack's sample payloads
don't have.

- Styles are read once transitions finish (`settle`); looping animations such as a status spinner
  are left running.
- Keyboard focus comes from pressing Tab, so `:focus-visible` matches as it would for a user.
  WebKit, like Safari by default, skips links on Tab, so the harness presses Option+Tab there.
- Where engines legitimately differ, the case says so. Chromium and Firefox snap a border narrower
  than 2px to whole CSS pixels at any scale, so only WebKit on a 2x screen (Safari on a Retina
  display) paints a checkbox's 1.5px border; the declared width is checked in every engine.

`SBK_ENGINES=firefox,webkit` runs only those engines (`bun run test:interaction` runs this file
alone). CI runs each engine in its own `Browser tests (<engine>)` job, in the Playwright image that
has all three browsers: Chromium runs every browser test, Firefox and WebKit only these.

## Behaviour probes

A probe records what Slack does when a control is driven: where focus goes, what opens and closes,
which option is highlighted, how far a list scrolls. It's `fixtures/<fixture>@<probe>.probe.json`,
next to its fixture, written like a fixture payload (`src/probes.ts`):

```json
{ "steps": [{ "click": "field-1" }, { "key": "ArrowDown" }, { "key": "Enter" }] }
```

A step is `{ "click": <target> }`, `{ "hover": <target> }`, `{ "key": "Shift+Tab" }` (Playwright's
key names), `{ "type": "text" }`, `{ "wait": 300 }`, `{ "scroll": "scroller-1", "left": "end" }`
(pixels or `"end"`, `left` and/or `top`, scripted on both sides since a scroll needs no trusted
input) or `{ "snapshot": "<label>" }`; a target is a control address or
`{ "role": "option", "name": "Bravo" }` for something in an open layer. `"snapshot": true` also
captures a reference after the last step, named after the probe, and a `snapshot` step captures
one at that point, named `<fixture>@<label>` with the item's theme and width; a hover right before
either is held through it. That's how a state that takes more than one interaction becomes a
reference: open a list, hover its second option, snapshot (`@open-hover-green`); compare.ts replays
the steps before it. A step in the name (`@open-field-1+hover-option-2`) would have needed a second
interaction grammar in names.ts, compare.ts, import.ts and the inventory, and still couldn't say
"after typing" or "after two arrow presses"; a probe already says all of that, so the label only
names the result.

A probe item named in another theme or width (`<fixture>@<probe>+dark`, `+mobile`), or with
`snapshotOnly: true`, only takes its snapshots, in that theme and width: behaviour and payloads
don't depend on them, so they're recorded once, from the light desktop run. Every snapshot's meta
records the control that had focus and whether it was drawn as keyboard focus (`focus: { target,
visible }`), so a probe that reaches an option or a dialog button with the keyboard
(`{ "key": "ArrowDown" }`, `{ "key": "Tab" }`) shows what it focused. A list driven by
`aria-activedescendant` keeps focus on its field while the arrow keys move the highlight; the
highlighted option is recorded too (`focus.active`). Block Kit Builder doesn't validate a
modal, so a probe that fills a field wrongly and submits records what's sent, not error styles.

`bun tools/visual/src/bundle.ts` lists the probes ready to pass as capture items. In the Builder,
`capture.js` performs each step with real input (above) and records what `observe.js` sees before
the first step and after each: the focused element (its address, role, accessible name, and whether
it's in the preview, a layer or elsewhere), the open layers (popover or dialog, role, scroll
offset), the highlighted option, a tooltip that's showing, whether anything is loading
(`aria-busy`, a spinner), and the states controls report (expanded, checked, value, pressed,
current page, selected, disabled, a column's sort, a Show more toggle's label). A recording counts
for the fidelity inventory's behaviour cells (`src/fidelity/captures.ts`): hover when a step hovers
(a tooltip with `{ "wait": … }` steps around it shows its delay), pressed when one clicks, open,
selected, loading, many items (a list that scrolled) and toggled (a control whose state changed)
when the observations show them. Names that
show a workspace member or channel are recorded as `<member>` or `<channel>`. `import.ts` writes
`fixtures/<fixture>@<probe>.behaviour.json`, maintainer-owned like the payload recordings, and the
last Actions Preview payload the probe produced to `<fixture>@<probe>.actions.json`.
`@submit-errors` records its behaviour the same way: the focus after the press, and whether a
`view_submission` went through.

With the playground running, `bun tools/visual/src/probes.ts [prefix...] [--check]` replays every
recording on our rendering with Playwright's real pointer and keyboard, observes it with the same
`observe.js`, and lists each difference
(`after step 2 (key ArrowDown): activeOption: Slack "Bravo", ours "Alpha"`). `--check` fails when
any recording differs.

## Action payloads

`fixtures/<fixture>@<interaction>.actions.json` records the `block_actions` payload Block Kit
Builder's Actions Preview showed after an interaction with the fixture: `button@click`,
`all-selects@pick-static` and so on. `packages/block-kit/src/actionPayloads.test.tsx` (part of
`bun run test`) renders the fixture, performs the same interaction and compares the payload
block-kit builds: `type`, `enterprise`, `is_enterprise_install`, `actions` and `state.values`.

- Not compared: identity, `action_ts`, the block ids Slack generates for blocks without one, and
  `container`, `message` and `channel`, which the Builder only simulates.
- Slack's `state.values` holds only what the user changed; block-kit also reports initial values
  from mount. Until that's checked against a real app, an entry Slack doesn't have is ignored while
  it still holds its initial value.
- Every remaining difference is listed in the test's `KNOWN_DIFFERENCES`. The test fails on a new
  difference and on a listed one that no longer happens, so a fix removes its entries.

`capture.js` records them during a run (above), and `import.ts` redacts them (`src/recordings.ts`)
and refuses one that still shows the workspace; `references:check` checks every recording and probe
names a fixture and shows nothing of the workspace. A recording made by a probe needs no
`INTERACTIONS` entry: the test replays the probe's steps. A `view_submission` or `view_closed` recording isn't compared until the test renders views.

To record one by hand, load the fixture in Block Kit Builder, perform the interaction, open Actions
Preview and copy the payload. Replace the identity before saving: `user` becomes
`{ "id": "U00000000", "username": "user", "name": "user", "team_id": "T00000000" }`, `team`
becomes `{ "id": "T00000000", "domain": "workspace" }`, `api_app_id`, `token`, `trigger_id`,
`response_url` and each `action_ts` become `"<field name>"`, and a block id Slack generated
becomes `"<block_id>"` (in `actions` and as the `state.values` key). Then add the interaction to
the test's `INTERACTIONS`. Recordings are maintainer-owned, like the references.

In CI, the Visual workflow's `render-diff` job runs this for every pull request the comparison
covers and uploads the result. The Visual preview workflow then checks the artifact
(`src/render/publish.ts`), uploads the renders to R2 and comments on the pull request, only when
something changed. [`docs/README.md`](../../docs/README.md#visual-previews) describes the setup.
