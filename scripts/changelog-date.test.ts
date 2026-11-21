import { describe, expect, it } from "bun:test";
import { newestRelease, stampLastModified } from "./changelog-date";

const PAGE = `---
title: Changelog
description: What changed.
mode: center
---

Every release.
`;

describe("stampLastModified", () => {
  it("dates the changelog page with the newest release", () => {
    expect(stampLastModified(PAGE, "2026-11-18")).toBe(`---
title: Changelog
description: What changed.
mode: center
lastModified: 2026-11-18
---

Every release.
`);
  });

  it("replaces a date already there", () => {
    const stamped = stampLastModified(stampLastModified(PAGE, "2026-10-01"), "2026-11-18");
    expect(stamped.match(/lastModified: .*/g)).toEqual(["lastModified: 2026-11-18"]);
  });

  it("refuses a page without frontmatter", () => {
    expect(() => stampLastModified("# Changelog\n", "2026-11-18")).toThrow(/frontmatter/);
  });
});

describe("newestRelease", () => {
  it("picks the highest version, not the latest tagged", () => {
    expect(
      newestRelease([
        "v0.8.8 2026-11-18T10:00:00+01:00",
        "v0.10.0 2026-11-20T09:00:00+01:00",
        "v0.9.1 2026-11-21T09:00:00+01:00",
        "not-a-release 2026-11-22T09:00:00+01:00",
      ]),
    ).toEqual({ tag: "v0.10.0", date: "2026-11-20" });
    expect(newestRelease([])).toBeUndefined();
  });
});
