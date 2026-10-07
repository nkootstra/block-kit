import { describe, expect, it } from "bun:test";
import { decideDeploy } from "./deploy-guard";

const MAIN = "a".repeat(40);
const OLD = "b".repeat(40);

describe("decideDeploy", () => {
  it("deploys the latest release's tag", () => {
    expect(
      decideDeploy({ ref: "refs/tags/v0.5.0", sha: OLD, mainHead: MAIN, latestTag: "v0.5.0" }),
    ).toMatchObject({ deploy: true, error: false });
  });

  it("skips an older release's tag, so a re-run can't replace newer docs", () => {
    expect(
      decideDeploy({ ref: "refs/tags/v0.4.0", sha: OLD, mainHead: MAIN, latestTag: "v0.5.0" }),
    ).toMatchObject({ deploy: false, error: false });
  });

  it("deploys main's head when the package hasn't changed since the latest release", () => {
    expect(
      decideDeploy({
        ref: "refs/heads/main",
        sha: MAIN,
        mainHead: MAIN,
        latestTag: "v0.5.0",
        packageChanged: false,
      }),
    ).toMatchObject({ deploy: true, error: false });
  });

  it("refuses main when the package has unreleased changes, so the docs never run ahead of npm", () => {
    expect(
      decideDeploy({
        ref: "refs/heads/main",
        sha: MAIN,
        mainHead: MAIN,
        latestTag: "v0.5.0",
        packageChanged: true,
      }),
    ).toMatchObject({ deploy: false, error: true });
  });

  it("skips a main commit that is no longer the head", () => {
    expect(
      decideDeploy({
        ref: "refs/heads/main",
        sha: OLD,
        mainHead: MAIN,
        latestTag: "v0.5.0",
        packageChanged: false,
      }),
    ).toMatchObject({ deploy: false, error: false });
  });

  it("deploys main before the first release", () => {
    expect(
      decideDeploy({ ref: "refs/heads/main", sha: MAIN, mainHead: MAIN, latestTag: undefined }),
    ).toMatchObject({ deploy: true, error: false });
  });

  it("refuses any other ref", () => {
    expect(
      decideDeploy({ ref: "refs/heads/feature", sha: MAIN, mainHead: MAIN, latestTag: "v0.5.0" }),
    ).toMatchObject({ deploy: false, error: true });
  });
});
