import { describe, expect, it } from "bun:test";
import { leaks, redact } from "./redact";

const meta = (payload: unknown) =>
  `<script type="application/json" id="sbk-reference-meta">${JSON.stringify({
    source: "https://app.slack.com/block-kit-builder/T0EXAMPLE01/builder",
    payload,
  })}</script>`;

const payload = {
  blocks: [{ type: "section", accessory: { type: "users_select", initial_user: "U0123456789" } }],
};

/** A users select opened in the Builder: its list holds the workspace's real members. */
const member = (name: string, id: string) =>
  `<div class="c-select_options_list__option"><img src="https://ca.slack-edge.com/T0EXAMPLE01-${id}-0123abcdef-24" alt="${name}">` +
  `<span data-qa="member-entity__primary-name"><strong class="" data-qa="member_name">${name}<span class="c-member_name__indicator" data-qa="member_name__you">(you)</span></strong></span></div>`;

const reference =
  `<!doctype html><html><head>${meta(payload)}</head><body>` +
  `<div aria-label="Ada Lovelace's profile">${member("Ada Lovelace", "U0EXAMPLE02")}${member("Grace Hopper", "U0EXAMPLE03")}` +
  `<span class="c-channel_entity__name c-channel_entity__name--bold">secret-plans</span>` +
  `<span data-team-id="T0EXAMPLE01">acme-corp</span>` +
  `<a href="https://acme.slack.com/team/U0EXAMPLE02">profile</a>` +
  `<span>U0123456789 stays: the fixture names it</span></div></body></html>`;

describe("redact", () => {
  const out = redact(reference);

  it("replaces member, channel and workspace names with stable placeholders", () => {
    for (const real of ["Ada Lovelace", "Grace Hopper", "secret-plans", "acme-corp"])
      expect(out).not.toContain(real);
    expect(out).toContain('data-qa="member_name">User One<');
    expect(out).toContain('data-qa="member_name">User Two<');
    expect(out).toContain('alt="User One"');
    expect(out).toContain(`aria-label="User One's profile"`);
    expect(out).toContain(">channel-one</span>");
    expect(out).toContain(">Workspace</span>");
  });

  it("replaces real Slack IDs, avatars and profile links but keeps the fixture's own IDs", () => {
    for (const real of ["T0EXAMPLE01", "U0EXAMPLE02", "U0EXAMPLE03", "ca.slack-edge.com", "/team/"])
      expect(out).not.toContain(real);
    expect(out).toContain("block-kit-builder/T0000001/builder");
    expect(out).toContain("U0123456789 stays");
  });

  it("gives the same name the same placeholder in every theme of a fixture", () => {
    expect(redact(reference.replace("<body>", '<body class="dark">'))).toBe(
      out.replace("<body>", '<body class="dark">'),
    );
  });

  it("is idempotent, so re-normalising a redacted reference changes nothing", () => {
    expect(redact(out)).toBe(out);
  });

  it("applies a local mapping for names Slack doesn't mark up", () => {
    expect(redact(`${meta(payload)}<p>Welcome to Acme</p>`, { Acme: "Example" })).toContain(
      "Welcome to Example",
    );
  });
});

describe("redact, on markup as the snapshot writes it", () => {
  it("finds names whose element carries more attributes after the marker", () => {
    const html =
      '<strong class="" data-qa="member_name" style="color:rgb(29, 28, 29)">Ada Lovelace<span>(you)</span></strong>' +
      '<span class="c-channel_entity__name c-channel_entity__name--bold" style="font-weight:700">secret-plans</span>' +
      '<span style="color:red" data-team-id="T0EXAMPLE01">acme-corp</span>';
    expect(leaks(html)).toEqual(
      expect.arrayContaining([
        'member name "Ada Lovelace"',
        'channel name "secret-plans"',
        'workspace name "acme-corp"',
      ]),
    );
    const out = redact(html);
    expect(out).toContain('style="color:rgb(29, 28, 29)">User One<span>');
    expect(out).toContain('style="font-weight:700">channel-one</span>');
    expect(out).toContain(">Workspace</span>");
    expect(leaks(out)).toEqual([]);
  });
});

describe("leaks", () => {
  it("finds the real names and identifiers a reference still contains", () => {
    expect(leaks(reference)).toEqual(
      expect.arrayContaining([
        "Slack ID T0EXAMPLE01",
        "Slack ID U0EXAMPLE02",
        "avatar URL https://ca.slack-edge.com/T0EXAMPLE01-U0EXAMPLE02-0123abcdef-24",
        "profile link https://acme.slack.com/team/U0EXAMPLE02",
        'member name "Ada Lovelace"',
        'channel name "secret-plans"',
        'workspace name "acme-corp"',
      ]),
    );
  });

  it("passes a redacted reference and the fixture's own placeholder IDs", () => {
    expect(leaks(redact(reference))).toEqual([]);
  });
});
