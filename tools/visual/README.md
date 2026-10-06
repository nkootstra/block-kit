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

## Text runs

The pixel diff scores a whole fixture with a per-pixel threshold, so it can't see a colour a few RGB
steps off, a 0.5px border or a run that moved by a pixel or two. Every fixture therefore also gets a
text-run check (`src/textRuns.ts`):

1. Every visible text node on both sides becomes a run, positioned relative to the rendered root
   (`src/collectTextRuns.ts`).
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

## Capture new references

1. `bun tools/visual/src/bundle.ts [prefix...] | pbcopy` copies the fixture payloads.
2. In Block Kit Builder, open the devtools console, paste the payloads into a loop that loads each
   one into the Builder and evaluates `snapshot.js` against the preview, collecting
   `{ "<fixture name>": "<html>" }`.
3. Copy the resulting JSON and write it to `fixtures/` with
   `pbpaste | bun tools/visual/src/import.ts`.

`snapshot.js` inlines each element's computed styles, with a few corrections so the frozen copy
lays out like the live page:

- **Widths are all frozen,** rounded up to the next 1/64px layout unit. A width serializes to six
  significant digits ("100.062px" for 100.0625), and a label sized to its text would wrap a hair
  short. Leaving content-sized widths to the replay is worse: it changes what the boxes beside them
  shrink and grow to, so a checkbox label's text lost 4px and wrapped.
- **A flex item in a row is pinned** to its frozen width (`flex: 0 0 <width>`), so the rounded-up
  row can't squeeze a tight item and an item with its own `flex-basis` doesn't ignore its width.
- **Heights left at `auto` aren't frozen** (read through CSS Typed OM). A box with a set height stops
  its last child's bottom margin from collapsing through it; with the widths frozen, the content
  lays out the same and gives the same height. Images and form controls keep theirs.
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
- a reference isn't in the lock file, or the lock file lists one that no longer exists.

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
