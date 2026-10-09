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
  page's comparison (`apps/site/src/assets/proof`). Baselines are recorded at 1x, so it can't be
  combined with `--check` or `--update-baseline`.
- `bun run compare:check` fails when a fixture regresses past its baseline (0.5 pp tolerance).
- `--update-baseline` records the current mismatch in `fixtures/visual-baseline.<platform>.json`
  and the flagged text runs in `fixtures/text-baseline.<platform>.json` ([Text runs](#text-runs));
  `--update-baseline=lower` only adds new fixtures and lowers improved ones.

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
<fixture>[@<interaction>][+mobile][+dark]
```

- **No suffix:** light theme, desktop width, nothing opened. These are the 123 catalog references.
- **`@<interaction>`:** captured after interacting with the preview. Fixture-specific ones
  (`@expanded`, `@sort-asc`, `@page-2`) are listed in `states.ts`; three apply to any fixture and
  act on its _first_ control of the kind:
  - `@open`: the first select, multi-select, time list, datepicker, datetime picker or overflow
    menu, opened;
  - `@confirm`: the first button, with its confirm dialog open (put the `confirm` on it);
  - `@dialog`: a section accessory's multi-select, with Slack's selection dialog open.
- **`+mobile`:** the Builder's Mobile preview; ours is rendered at that width.
- **`+dark`:** the Builder in its dark theme (recorded as `theme` in the reference's meta); ours is
  rendered with `theme="dark"` (`?theme=dark` on the playground's render page), on the reference's
  page background.

The suffix parts always come in that order (`@open+mobile+dark`), so each state has one name;
`import.ts` and `references:check` reject any other spelling.

**Open states.** `snapshot.js` also freezes every open Slack popover or dialog it finds in the
Builder's `.ReactModalPortal`, and records each in the meta's `layers` (`kind`, and its box relative
to the preview):

- A **popover** (a select list, the calendar, the time list, the overflow menu) is placed in the
  reference where it sat relative to the preview, and the page is padded so one that sticks out to
  the left of the message still fits. `compare.ts` crops both sides to one box, relative to the
  message, that holds both sides' message and popovers (`layout.ts`), and moves our message away
  from the window's edge so our popover isn't pushed inward. A popover a few pixels off shows as a
  diff instead of shifting the whole image. The text check reads the popover's text too.
- A **dialog** (a confirm dialog, the multi-select dialog) is centred in the window, so its position
  says nothing; it's compared on its own, against ours (`.sbk-confirm`, `.sbk-select-dialog`).

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
   with a real click and set `window.sbkCaptureReady = true`.
   Keep the Builder tab visible: macOS pauses a hidden tab and the preview never settles. When the
   run is done, switch the Builder back to light.
   Paste the scripts into a freshly loaded Builder. Late in a long session the Builder can load a
   stylesheet that repeats rules it already has, which reorders the cascade (it once shifted every
   datetime picker 8px). `capture.js` inventories the page's stylesheets on its first call and
   refuses to snapshot once a later sheet repeats one of their rules: reload the Builder, paste the
   scripts again and resume from the item it names.
   A fixture that needs a real workspace file (`slack_file`) carries the placeholder file URL
   (`https://files.slack.com/files-pri/T0000001-F0000001/file`). Map it to the file's link in
   `tools/visual/capture.local.json` (`{ "<placeholder>": "<link>" }`, ignored by git) and pass
   that object as `substitute`: only the Builder sees the link, and `import.ts` redacts it again.
   The comparison serves `fixtures/assets/slack-file.png`, a copy of that file, for the placeholder
   to both sides.

3. Copy the resulting `refs` JSON and write it to `fixtures/` with
   `pbpaste | bun tools/visual/src/import.ts`.

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
it should be compared in have a reference (light, `+mobile`, `+dark`, and `@open`, `@confirm` or
`@dialog` in both themes where its controls have them), and which interactive fixtures have a
payload recording. CI adds it to the `check` job's summary; it reports and doesn't fail yet.

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

`src/snapshotReplay.browser.ts` checks all of this without the Builder: our own rendering of every
fixture is snapshotted the way the capture loop does it, replayed, and every element must land
within 0.5px of where it was live. `src/snapshot.browser.ts` holds the small reproductions.

Snapshots are normalized (`normalize.ts`) so timestamps, avatars and generated ids don't produce
noise. After adding a normalize rule, run `bun tools/visual/src/renormalize.ts` to rewrite the
committed references.

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
  the playground, `fixtures/`, `tools/visual/` or the dependencies. Otherwise the `compare` job is
  skipped, which counts as passing.
- A pull request is checked against the **base branch's** baseline, so it can't loosen its own
  check. A fixture with no entry yet is reported, not failed. A maintainer accepts a deliberate
  regression with the `visual-baseline-increase` label.
- After a merge, the workflow records the new numbers on `main` and commits them: new fixtures and
  improvements beyond the tolerance always, increases only when the merged PR carried the label.
  It pushes with the `VISUAL_DEPLOY_KEY` deploy key, which the `protect main` ruleset lets bypass
  the pull request requirement. CI runs on that commit, so a release can be cut from it; the Visual
  workflow ignores it, since only the baseline changed.
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
rest.

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

CI runs them in the `render-diff` job, whose Playwright image has all three browsers.

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

To record one, load the fixture in Block Kit Builder, perform the interaction, open Actions Preview
and copy the payload. Replace the identity before saving: `user` becomes
`{ "id": "U00000000", "username": "user", "name": "user", "team_id": "T00000000" }`, `team`
becomes `{ "id": "T00000000", "domain": "workspace" }`, `api_app_id`, `token`, `trigger_id`,
`response_url` and each `action_ts` become `"<field name>"`, and a block id Slack generated
becomes `"<block_id>"` (in `actions` and as the `state.values` key). Then add the interaction to
the test's `INTERACTIONS`. Recordings are maintainer-owned, like the references.

In CI, the Visual workflow's `render-diff` job runs this for every pull request the comparison
covers and uploads the result. The Visual preview workflow then checks the artifact
(`src/render/publish.ts`), uploads the renders to R2 and comments on the pull request, only when
something changed. [`docs/README.md`](../../docs/README.md#visual-previews) describes the setup.
