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
- `bun run compare:check` fails when a fixture regresses past its baseline (0.5 pp tolerance).
- `--update-baseline` records the current mismatch in `fixtures/visual-baseline.<platform>.json`;
  `--update-baseline=lower` only adds new fixtures and lowers improved ones.

Open `test-results/visual/index.html` for side-by-side reference / ours / diff images.

`bun tools/visual/src/inspect.ts <fixture> [--ours]` prints a box-model tree, which is the quickest
way to read the exact paddings, line heights and colours Slack uses.

## Capture new references

1. `bun tools/visual/src/bundle.ts [prefix...] | pbcopy` copies the fixture payloads.
2. In Block Kit Builder, open the devtools console, paste the payloads into a loop that loads each
   one into the Builder and evaluates `snapshot.js` against the preview, collecting
   `{ "<fixture name>": "<html>" }`.
3. Copy the resulting JSON and write it to `fixtures/` with
   `pbpaste | bun tools/visual/src/import.ts`.

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

`bun run --cwd tools/visual test:browser` runs the tests that need Chromium
(`bunx playwright install chromium`); `bun run test` runs the rest.

In CI, the Visual workflow's `render-diff` job runs this for every pull request the comparison
covers and uploads the result. The Visual preview workflow then checks the artifact
(`src/render/publish.ts`), uploads the renders to R2 and comments on the pull request, only when
something changed. [`docs/README.md`](../../docs/README.md#visual-previews) describes the setup.
