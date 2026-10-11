import { describe, expect, it } from "bun:test";
import { CANARY, findLeaks } from "./check-examples";

describe("findLeaks", () => {
  it("finds the canary, any bot token and the Slack SDK", () => {
    const leaks = findLeaks([
      { path: "a.js", text: `const token = "${CANARY}";` },
      { path: "b.js", text: 'fetch("https://slack.com/api/users.info")' },
      { path: "c.js", text: 'import("@slack/web-api")' },
      { path: "d.js", text: "headers.authorization = 'Bearer xoxb-0000'" },
    ]);
    expect(leaks).toEqual([
      "a.js: the canary bot token",
      "a.js: a bot token",
      "b.js: a Slack Web API URL",
      "c.js: the Slack Web API SDK",
      "d.js: a bot token",
    ]);
  });

  it("passes code that only talks to its own server", () => {
    expect(findLeaks([{ path: "e.js", text: 'fetch("/api/slack/resolve")' }])).toEqual([]);
  });
});
