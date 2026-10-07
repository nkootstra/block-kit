/**
 * Decides whether a CI run may deploy the docs and the landing page to production. They deploy
 * with releases, so they never document a package npm doesn't have yet:
 *
 * - The Release workflow runs CI on the new `vX.Y.Z` tag; only the latest release's tag deploys, so
 *   re-running an older release's CI can't replace newer docs.
 * - A maintainer can run CI on `main` by hand for a docs-only fix. It deploys only `main`'s head,
 *   and refuses when `packages/block-kit` changed since the latest release.
 *
 * In CI, `bun scripts/deploy-guard.ts` reads REF, SHA, MAIN_HEAD, LATEST_TAG and PACKAGE_CHANGED
 * from the environment, writes `deploy=true|false` to $GITHUB_OUTPUT, and exits 1 on a refusal.
 */
import { appendFileSync } from "node:fs";

export interface DeployInput {
  /** `GITHUB_REF`: `refs/tags/vX.Y.Z` or `refs/heads/main`. */
  ref: string;
  /** The commit this run built. */
  sha: string;
  /** `main`'s head now. */
  mainHead: string;
  /** The highest `vX.Y.Z` tag, or undefined before the first release. */
  latestTag: string | undefined;
  /** Whether `packages/block-kit` changed between the latest tag and `sha`. */
  packageChanged?: boolean;
}

export interface DeployDecision {
  deploy: boolean;
  /** True when the run must fail: a deploy was asked for that would break the rule. */
  error: boolean;
  reason: string;
}

export function decideDeploy({
  ref,
  sha,
  mainHead,
  latestTag,
  packageChanged,
}: DeployInput): DeployDecision {
  if (ref.startsWith("refs/tags/")) {
    const tag = ref.slice("refs/tags/".length);
    return tag === latestTag
      ? { deploy: true, error: false, reason: `${tag} is the latest release.` }
      : {
          deploy: false,
          error: false,
          reason: `${tag} isn't the latest release (${latestTag ?? "none"}); its docs stay as they are.`,
        };
  }
  if (ref === "refs/heads/main") {
    if (sha !== mainHead) {
      return {
        deploy: false,
        error: false,
        reason: `main is at ${mainHead} now, so this run (${sha}) leaves the deploy to a later one.`,
      };
    }
    if (latestTag !== undefined && packageChanged !== false) {
      return {
        deploy: false,
        error: true,
        reason: `packages/block-kit changed since ${latestTag}, so main's docs would describe a package npm doesn't have. Release it instead; the release deploys the docs.`,
      };
    }
    return { deploy: true, error: false, reason: "main has no unreleased package changes." };
  }
  return {
    deploy: false,
    error: true,
    reason: `${ref} can't deploy: only a release tag or main can.`,
  };
}

if (import.meta.main) {
  const env = process.env;
  const decision = decideDeploy({
    ref: env.REF ?? "",
    sha: env.SHA ?? "",
    mainHead: env.MAIN_HEAD ?? "",
    latestTag: env.LATEST_TAG || undefined,
    packageChanged:
      env.PACKAGE_CHANGED === "true" ? true : env.PACKAGE_CHANGED === "false" ? false : undefined,
  });
  console.log(`${decision.error ? "::error::" : "::notice::"}${decision.reason}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `deploy=${decision.deploy}\n`);
  if (decision.error) process.exit(1);
}
