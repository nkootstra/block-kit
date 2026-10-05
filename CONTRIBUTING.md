# Contributing

Thanks for helping out. `@nkootstra/block-kit` renders Slack Block Kit JSON in React the way Slack
does, so most changes come down to one question: does it match what Slack shows?

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs**: open an issue with the Block Kit JSON, what Slack shows and what the package shows.
- **Features**: open an issue first, so we can agree on the API before you write it.
- **Security issues**: don't open an issue; follow [`SECURITY.md`](SECURITY.md).

Small fixes (typos, docs, an obvious bug) can go straight to a pull request.

## Set up

You need [Bun](https://bun.sh) 1.4.2 or later.

```sh
bun install
bun run build
bun run test
```

[`docs/README.md`](docs/README.md) describes the repository layout and how to run the docs site and
the playground.

## Checks

A pull request has to pass:

```sh
bun run lint
bun run format:check
bun run type-check
bun run test
bun run references:check
```

`bun run format` fixes formatting. Pull requests that touch rendering also run the visual comparison
against Slack; [`tools/visual/README.md`](tools/visual/README.md) explains how to run it locally.

## Rendering changes

Slack's rendering is the reference, not our opinion of it. For a change to how something looks:

- Add or edit a fixture payload in `fixtures/` that shows it.
- Say in the pull request's "Slack reference" section which fixtures show the change and how the
  visual comparison moved.
- Leave `fixtures/**/*.reference.html`, `fixtures/references.lock.json` and
  the `fixtures/visual-baseline.*.json` and `fixtures/text-baseline.*.json` files alone. They record what Slack renders and are owned by the
  maintainers, who capture new references in Block Kit Builder. Never edit them to make a check pass.

## Docs change with the code

A change to anything users see (components, props, hooks, entry points, rendering) updates the docs
in the same pull request:

- `apps/docs`, the documentation site;
- `docs/README.md` and `packages/block-kit/README.md` (the npm page) where they cover it; the two
  share the install and entry-point sections, so change them together;
- `apps/docs/skills/block-kit/SKILL.md`, the agent skill, where it applies.

## Commits and pull requests

- Write PR titles and commit subjects as `type(scope): subject`, for example
  `fix(select): keep the chosen option after a re-render`. Types: `feat`, `fix`, `perf`,
  `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `revert`. The scope is required and can be any
  lowercase word. Add `!` after it for a breaking change: `feat(provider)!: …`.
- The PR title becomes the line in the release notes, so write it for the people using the package.
  The docs' changelog at `/changelog` shows those notes.
- Sign every commit with an SSH or GPG key added to your GitHub account as a signing key; `main`
  rejects unverified commits. GitHub's
  [guide to signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)
  walks through it.
- No AI attribution: no `Co-authored-by` trailers for bots or tools, and no "Generated with …"
  footers or badges.
- Fill in the pull request template and keep all of its sections.

CI checks each of these rules.

## Versions and releases

Don't write a version number anywhere: every `package.json` stays at `0.0.0`, and the docs say
`latest`. A maintainer cuts releases from the Release workflow, which takes the version from the
git tag and publishes to npm.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
