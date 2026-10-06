# block-kit — contributor rules

`@nkootstra/block-kit` renders Slack Block Kit JSON in React, pixel-for-pixel the way Slack does.
Bun + Turborepo; `docs/README.md` describes the layout.

## Workflow

- Merge gates: `bun run lint`, `bun run format:check`, `bun run type-check`, `bun run test` and
  `bun run references:check`. Pull requests also run the visual comparison against Slack
  (`tools/visual/README.md`).
- CI on a pull request runs only what the change can affect: Turbo's `--affected` picks the
  workspaces to build, type-check and test (root `package.json`, `bun.lock`, `tsconfig.base.json`
  and `turbo.json` affect all of them), and the visual comparison runs only when the package, the
  playground, `fixtures/`, `tools/visual/` or the dependencies change. `main` always runs
  everything. When a new file outside the workspaces starts feeding a build, add it to
  `globalDependencies` in `turbo.json`.
- **Docs change with the code.** A change to anything a user sees (components, props, hooks, entry
  points, rendering) updates `apps/docs` and, where it applies, `docs/README.md`,
  `packages/block-kit/README.md` and the agent skill in `apps/docs/skills/block-kit/SKILL.md` in
  the same PR. `packages/block-kit/README.md` is the npm page: it repeats the install and
  entry-point sections of `docs/README.md`, so change them together.
  `packages/block-kit/LICENSE` is a copy of the root `LICENSE`.
- `CONTRIBUTING.md` repeats these rules for people. A change to the rules here changes it too.

## Visual references

`fixtures/**/*.reference.html`, `fixtures/references.lock.json`, the
`fixtures/visual-baseline.*.json` and `fixtures/text-baseline.*.json` files, and the
`fixtures/**/*.actions.json` payload recordings record what Slack renders and sends, and are owned
by the maintainers.
Never edit them by hand or to make a check pass; `tools/visual/README.md` explains how they change.

## Versions and releases

- Never write a version by hand: not in a `package.json`, code or docs. The release's git tag is
  the only source. Every `package.json` version stays `0.0.0`; the release stamps the published
  package with `scripts/set-version.ts`. Docs use `latest`.
- There is no changelog file. Each GitHub release's notes are generated from the titles of the PRs
  it contains, so a PR title is its changelog line: write it for the people using the package.
  Only PRs that change the package (not just its tests) are listed, grouped into breaking changes,
  features and fixes by their title; `.github/workflows/labeler.yml` applies the labels that
  `.github/release.yml` groups by. Docs, playground and CI PRs stay out of the notes. The docs show
  every release's notes at `/changelog`, read from GitHub when they build.
- A release fails when nothing in `packages/block-kit` changed since the last tag.
- Releases run from Actions → Release → Run workflow on `main`, choosing `patch`, `minor` or
  `major`. The workflow requires green CI for the commit, publishes to npm through trusted
  publishing (no npm token exists; never run `npm publish` locally), then tags `vX.Y.Z` and creates
  the GitHub release, and runs CI on `main` again so the docs rebuild with it. While the version is
  0.x, a breaking change is a `minor` release.

## Commits & PRs

- PR titles and commit subjects read `type(scope): subject`, e.g.
  `fix(select): keep the chosen option after a re-render`. Types: `feat`, `fix`, `perf`,
  `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `revert`. The scope is required, any
  lowercase word; add `!` after it for a breaking change.
- Sign every commit (SSH or GPG) with a key added to your GitHub account as a signing key. `main`
  rejects unverified commits.
- No AI attribution: no `Co-authored-by` trailers for bots or tools, no "Generated with …" footers
  or badges, in commits or PR descriptions.
- Fill in the PR template; don't delete its sections. CI checks every rule here.
