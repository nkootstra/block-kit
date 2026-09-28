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
- `--update-baseline` records the current mismatch in `fixtures/visual-baseline.<platform>.json`.

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
noise.
