import { describe, expect, it } from "bun:test";
import { leaks, redact, SLACK_FILE_PLACEHOLDER } from "./redact";

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

describe("redact, on Slack's own system users", () => {
  it("replaces a system user's ID such as USLACKSECURITY, which isn't shaped like a member's", () => {
    const html =
      '<span data-qa="USLACKSECURITY" class="c-select_options_list__option_label">Slack Security</span>';
    expect(leaks(html)).toEqual(["Slack ID USLACKSECURITY"]);
    const out = redact(html);
    expect(out).not.toContain("USLACKSECURITY");
    expect(out).toContain('data-qa="U0000001"');
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

describe("redact, on Slack files", () => {
  const file = "https://files.slack.com/files-pri/T0EXAMPLE01-F0EXAMPLE04/holiday-photo.png";
  const thumb =
    "https://files.slack.com/files-tmb/T0EXAMPLE01-F0EXAMPLE04-0a1b2c3d4e/holiday-photo_720.png";
  const permalink = "https://acme-corp.slack.com/files/U0EXAMPLE02/F0EXAMPLE04/holiday-photo.png";
  const proxied = `https://slack-imgs.com/?c=1&amp;o1=ro&amp;url=${encodeURIComponent(file)}`;
  const html =
    `${meta({ blocks: [{ type: "image", slack_file: { id: "F0123456789" }, alt_text: "a" }] })}` +
    `<img src="${file}" srcset="${thumb} 2x" alt="a"><a href="${permalink}">open</a>` +
    `<img src="${proxied}"><a href="https://slack-files.com/T0EXAMPLE01-F0EXAMPLE04-0a1b2c3d4e">public</a>` +
    `<a href="https://acme-corp.slack.com/archives/C0EXAMPLE05">channel</a>`;

  it("finds file URLs, file IDs and the workspace's own subdomain", () => {
    expect(leaks(html)).toEqual(
      expect.arrayContaining([
        `file URL ${file}`,
        `file URL ${thumb}`,
        `file URL ${permalink}`,
        "file URL https://slack-files.com/T0EXAMPLE01-F0EXAMPLE04-0a1b2c3d4e",
        `file URL ${encodeURIComponent(file)}`,
        "Slack ID F0EXAMPLE04",
        "workspace domain acme-corp.slack.com",
      ]),
    );
  });

  it("replaces them with placeholders, keeping the fixture's own file ID", () => {
    const out = redact(html);
    for (const real of ["holiday-photo", "T0EXAMPLE01", "F0EXAMPLE04", "U0EXAMPLE02", "acme-corp"])
      expect(out).not.toContain(real);
    expect(out).toContain(`src="${SLACK_FILE_PLACEHOLDER}"`);
    expect(out).toContain(encodeURIComponent(SLACK_FILE_PLACEHOLDER));
    expect(out).toContain("https://workspace.slack.com/archives/");
    expect(out).toContain("F0123456789");
    expect(leaks(out)).toEqual([]);
    expect(redact(out)).toBe(out);
  });
});

// The snapshot freezes each element's width, measured on the real name. A placeholder of another
// length then gets cut off ("User Fo") or leaves a gap, and the presence dot after it sits where
// the real name ended. The name's own element (and a wrapper around only it) lays out again.
describe("redact, on the widths frozen around a name", () => {
  const row = (name: string) =>
    `<div style="display:flex;width:300px;flex-basis:300px">` +
    `<span style="display:flex;width:96.5px;flex-basis:96.5px;flex-shrink:0">` +
    `<span data-qa="member_name" style="width:96.5px;max-width:96.5px;min-width:96.5px;flex-basis:96.5px;overflow:hidden;text-overflow:ellipsis;color:red">${name}</span>` +
    `</span><span style="width:12px">●</span></div>`;
  const styleOf = (html: string, n: number) =>
    [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1])[n] ?? "";

  it("releases the name's own width, and its wrapper's, but keeps the row's", () => {
    const out = redact(meta(payload) + row("A Much Longer Real Name"));
    expect(out).toContain(">User One<");
    expect([styleOf(out, 0), styleOf(out, 1), styleOf(out, 2), styleOf(out, 3)]).toEqual([
      "display:flex;width:300px;flex-basis:300px",
      "display:flex;flex-shrink:0",
      "overflow:hidden;text-overflow:ellipsis;color:red",
      "width:12px",
    ]);
  });

  it("releases them on a reference redacted before, and stays idempotent", () => {
    const once = redact(meta(payload) + row("User One"));
    expect(styleOf(once, 2)).toBe("overflow:hidden;text-overflow:ellipsis;color:red");
    expect(redact(once)).toBe(once);
  });

  // A select's member row: the name's box also holds an AGENT badge, and a presence dot and the
  // secondary name follow it inside the member's primary content, which the snapshot froze to fit
  // the real name. Left frozen, the badge wraps out of view and the secondary name starts where the
  // real name ended.
  const member = (name: string) =>
    `<div class="c-base_entity__text-contents" style="display:flex;width:246px;flex-basis:246px">` +
    `<span class="c-member__primary_content" style="display:flex;width:117.7px;flex-basis:117.7px;max-width:100%;min-width:0px">` +
    `<span class="c-member__member-name" style="display:block;width:89.7px;flex-basis:89.7px;min-width:0px">` +
    `<span class="c-truncate" style="display:flow-root;width:89.7px;overflow-x:hidden">` +
    `<strong data-qa="member_name" style="font-weight:700">${name}` +
    `<span class="c-app_badge" style="display:inline-block;width:39.4px">AGENT</span></strong>` +
    `</span></span>` +
    `<span class="c-member__presence" style="display:block;width:20px;flex-basis:20px"></span>` +
    `<span class="c-member__secondary-name" style="display:block"><span class="c-truncate" style="display:flow-root">${name}</span></span>` +
    `</span></div>`;

  it("releases the sizes a member's name set through its primary content, badge and secondary name included", () => {
    const out = redact(meta(payload) + member("Real Name"));
    expect(out).toContain(">User One<span");
    expect([0, 1, 2, 3, 5, 6].map((n) => styleOf(out, n))).toEqual([
      "display:flex;width:246px;flex-basis:246px",
      "display:flex;max-width:100%;min-width:0px",
      "display:block;min-width:0px",
      "display:flow-root;overflow-x:hidden",
      "display:inline-block;width:39.4px",
      "display:block;width:20px;flex-basis:20px",
    ]);
    expect(redact(out)).toBe(out);
  });

  // A select's channel row: the name sits in an ellipsis box inside the entity's content, a
  // truncating box and the entity's text, which the snapshot froze to fit the real channel name.
  // Left frozen, a longer placeholder is cut off mid-word ("channel-t").
  const channel = (name: string) =>
    `<div class="c-base_entity__text-contents" style="display:flex;width:420px;flex-basis:420px">` +
    `<span class="c-base_entity__text" style="display:block;width:37.6px;min-width:0px">` +
    `<span class="c-truncate c-truncate--break_words" style="display:flow-root;width:37.6px;overflow-x:hidden">` +
    `<span class="c-small_channel_entity__content" style="display:inline;width:37.6px">` +
    `<span class="c-channel_entity__name c-channel_entity__name--bold" style="overflow-x:hidden;text-overflow:ellipsis">${name}</span>` +
    `</span></span></span></div>`;

  it("releases the sizes a channel's name set through the entity's text", () => {
    const out = redact(meta(payload) + channel("ops"));
    expect(out).toContain(">channel-one<");
    expect([0, 1, 2, 3, 4].map((n) => styleOf(out, n))).toEqual([
      "display:flex;width:420px;flex-basis:420px",
      "display:block;min-width:0px",
      "display:flow-root;overflow-x:hidden",
      "display:inline",
      "overflow-x:hidden;text-overflow:ellipsis",
    ]);
    expect(redact(out)).toBe(out);
  });
});
