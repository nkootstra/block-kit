import { describe, expect, it } from "vitest";
import { signSlackRequest } from "./sign";

describe("signSlackRequest", () => {
  // Slack's own documented example:
  // https://api.slack.com/authentication/verifying-requests-from-slack
  it("matches Slack's documented known-good vector", () => {
    const signingSecret = "8f742231b10e8888abcd99yyyzzz85a5";
    const timestamp = 1531420618;
    const body =
      "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c";

    expect(signSlackRequest(signingSecret, timestamp, body)).toBe(
      "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
    );
  });

  it("changes when the secret, timestamp, or body changes", () => {
    const base = signSlackRequest("secret-a", 1000, "payload=%7B%7D");
    expect(signSlackRequest("secret-b", 1000, "payload=%7B%7D")).not.toBe(base);
    expect(signSlackRequest("secret-a", 1001, "payload=%7B%7D")).not.toBe(base);
    expect(signSlackRequest("secret-a", 1000, "payload=%7B%22a%22%3A1%7D")).not.toBe(base);
  });
});
