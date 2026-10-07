/**
 * Keeps the Block Kit Builder workspace out of the references. A capture shows whatever the
 * workspace holds: a users or conversations select lists its members (names, avatars, user IDs)
 * and channels, and the snapshot records the workspace's team ID and name. None of that belongs in
 * git, so import.ts (through normalize.ts) swaps it for stable placeholders, and `references:check`
 * fails on a reference that still has any of it.
 *
 * Slack marks most of it up: member names (`data-qa="member_name"`), channel names
 * (`c-channel_entity__name`), the workspace name (`data-team-id`), avatars (ca.slack-edge.com),
 * IDs (`T0…`, `U0…`, `F0…`), file URLs (files.slack.com, slack-files.com, permalinks, also inside a
 * proxy's encoded `url=`) and the workspace's own subdomain. A name that only appears as plain text can be mapped in
 * `tools/visual/redact.local.json` (`{ "Real name": "Placeholder" }`), which is never committed.
 * IDs the fixture itself uses (`U0123456789`) are its own placeholders and stay.
 */
import { join } from "node:path";

/** A real Slack ID: a type letter, `0`, and at least eight more characters. Placeholders are shorter. */
// Slack's own system users (USLACKBOT, USLACKSECURITY) aren't shaped like a member's ID, but they
// key avatar URLs and list options the same way.
const SLACK_ID = /\b(?:[TUCWBF]0[A-Z0-9]{8,}|USLACK[A-Z]+)\b/g;
const AVATAR = /https:\/\/(?:ca|avatars)\.slack-edge\.com\/[^"'()\s&<]*/g;
const PROFILE_LINK =
  /https?:\/\/(?:[a-z0-9-]+\.slack\.com\/team\/|app\.slack\.com\/client\/)[^"'\s<]*/g;
/**
 * A Slack file: its private and thumbnail URLs, its permalink on the workspace's own domain, and
 * its public link. A file URL carries the team, user and file IDs and the file's own name.
 */
const FILE_URL =
  /https?:\/\/(?:files\.slack\.com\/|slack-files\.com\/|[a-z0-9-]+\.slack\.com\/files\/)[^"'\s<>)&]*/g;
/** The same, URL-encoded inside a proxy URL such as slack-imgs.com's `url=` parameter. */
const ENCODED_FILE_URL =
  /https?%3A%2F%2F(?:files\.slack\.com%2F|slack-files\.com%2F|[a-z0-9-]+\.slack\.com%2Ffiles%2F)[^"'\s<>)&]*/gi;
/** A workspace's own subdomain (acme.slack.com); Slack's shared hosts are fine. */
const WORKSPACE_DOMAIN =
  /https?:\/\/(?!(?:app|api|a|ca|files|edgeapi|status|avatars|emoji|docs|workspace)\.)([a-z0-9-]+)\.slack\.com/g;
const MEMBER_NAME = /<[a-z]+\b[^>]*\bdata-qa="member_name"[^>]*>([^<]+)</g;
const CHANNEL_NAME = /<[a-z]+\b[^>]*\bclass="c-channel_entity__name\b[^"]*"[^>]*>([^<]+)</g;
const WORKSPACE_NAME = /<[a-z]+\b[^>]*\bdata-team-id="[^"]*"[^>]*>([^<]+)</g;
/** Inline images and fonts can contain anything; they're never redacted or flagged. */
const DATA_URI = /data:[^"')\s]+/g;

/** A 1×1 grey GIF standing in for a member's avatar. */
const AVATAR_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
const WORKSPACE_PLACEHOLDER = "Workspace";
/** What a Slack file's URL becomes: a file in the placeholder workspace, under a neutral name. */
export const SLACK_FILE_PLACEHOLDER = "https://files.slack.com/files-pri/T0000001-F0000001/file";
const ORDINALS = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];
const ordinal = (i: number) => ORDINALS[i] ?? String(i + 1);
const MEMBER_PLACEHOLDER = new RegExp(`^User (${ORDINALS.join("|")}|\\d+)$`);
const CHANNEL_PLACEHOLDER = new RegExp(`^channel-(${ORDINALS.join("|").toLowerCase()}|\\d+)$`);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unescapeHtml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Applies `fn` to the parts of `html` outside data: URIs. */
function outsideDataUris(html: string, fn: (part: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of html.matchAll(DATA_URI)) {
    out += fn(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(html.slice(last));
}

/** The Slack IDs the fixture's own payload uses: placeholders the fixture chose, not real ones. */
function fixtureIds(html: string): Set<string> {
  const meta = html.match(/id="sbk-reference-meta">([\s\S]*?)<\/script>/)?.[1];
  if (!meta) return new Set();
  try {
    const { payload } = JSON.parse(meta) as { payload?: unknown };
    return new Set(JSON.stringify(payload ?? null).match(SLACK_ID) ?? []);
  } catch {
    return new Set();
  }
}

const distinct = (html: string, pattern: RegExp, keep: (name: string) => boolean) => [
  ...new Set(
    [...html.matchAll(pattern)]
      .map((m) => unescapeHtml(m[1] ?? "").trim())
      .filter((n) => n && !keep(n)),
  ),
];

/** Replaces `name` where it stands alone: as a text node, or as words of an attribute value. */
function replaceName(html: string, name: string, placeholder: string): string {
  const forms = [...new Set([name, escapeHtml(name), escapeHtml(name).replace(/'/g, "&#39;")])];
  let out = html;
  for (const form of forms) {
    const word = new RegExp(`(?<![\\w-])${escapeRegExp(form)}(?![\\w-])`, "g");
    out = out
      .replace(new RegExp(`>(\\s*)${escapeRegExp(form)}(\\s*)<`, "g"), `>$1${placeholder}$2<`)
      .replace(/(\b(?:alt|title|aria-label)=")([^"]*)"/g, (_, attr: string, value: string) => {
        return `${attr}${value.replace(word, placeholder)}"`;
      });
  }
  return out;
}

/**
 * Swaps the workspace's members, channels, name, avatars and IDs for stable placeholders: the
 * same name gets the same placeholder in every theme and width of a fixture. Idempotent.
 */
export function redact(html: string, mapping: Record<string, string> = {}): string {
  let out = html;
  for (const [real, placeholder] of Object.entries(mapping))
    out = outsideDataUris(out, (part) => part.replaceAll(real, placeholder));

  const members = distinct(out, MEMBER_NAME, (n) => MEMBER_PLACEHOLDER.test(n));
  const channels = distinct(out, CHANNEL_NAME, (n) => CHANNEL_PLACEHOLDER.test(n));
  const workspaces = distinct(out, WORKSPACE_NAME, (n) => n === WORKSPACE_PLACEHOLDER);
  out = outsideDataUris(out, (part) => {
    let next = part
      .replace(AVATAR, AVATAR_PLACEHOLDER)
      .replace(PROFILE_LINK, "#")
      .replace(FILE_URL, SLACK_FILE_PLACEHOLDER)
      .replace(ENCODED_FILE_URL, encodeURIComponent(SLACK_FILE_PLACEHOLDER))
      .replace(WORKSPACE_DOMAIN, (url, host: string) => url.replace(`${host}.`, "workspace."));
    members.forEach((name, i) => (next = replaceName(next, name, `User ${ordinal(i)}`)));
    channels.forEach(
      (name, i) => (next = replaceName(next, name, `channel-${ordinal(i).toLowerCase()}`)),
    );
    for (const name of workspaces) next = replaceName(next, name, WORKSPACE_PLACEHOLDER);
    return next;
  });

  const own = fixtureIds(out);
  const ids = new Map<string, string>();
  const counters: Record<string, number> = {};
  return outsideDataUris(out, (part) =>
    part.replace(SLACK_ID, (id) => {
      if (own.has(id)) return id;
      if (!ids.has(id)) {
        const kind = id.charAt(0);
        const n = (counters[kind] = (counters[kind] ?? 0) + 1);
        ids.set(id, `${kind}0${String(n).padStart(6, "0")}`);
      }
      return ids.get(id) as string;
    }),
  );
}

/** What of the workspace a reference still shows; empty once it's redacted. */
export function leaks(html: string): string[] {
  const own = fixtureIds(html);
  const found = new Set<string>();
  outsideDataUris(html, (part) => {
    for (const [id] of part.matchAll(SLACK_ID)) if (!own.has(id)) found.add(`Slack ID ${id}`);
    for (const [url] of part.matchAll(AVATAR)) found.add(`avatar URL ${url}`);
    for (const [url] of part.matchAll(PROFILE_LINK)) found.add(`profile link ${url}`);
    for (const [url] of part.matchAll(FILE_URL))
      if (url !== SLACK_FILE_PLACEHOLDER) found.add(`file URL ${url}`);
    for (const [url] of part.matchAll(ENCODED_FILE_URL))
      if (url !== encodeURIComponent(SLACK_FILE_PLACEHOLDER)) found.add(`file URL ${url}`);
    for (const [, host] of part.matchAll(WORKSPACE_DOMAIN))
      found.add(`workspace domain ${host}.slack.com`);
    return part;
  });
  for (const name of distinct(html, MEMBER_NAME, (n) => MEMBER_PLACEHOLDER.test(n)))
    found.add(`member name "${name}"`);
  for (const name of distinct(html, CHANNEL_NAME, (n) => CHANNEL_PLACEHOLDER.test(n)))
    found.add(`channel name "${name}"`);
  for (const name of distinct(html, WORKSPACE_NAME, (n) => n === WORKSPACE_PLACEHOLDER))
    found.add(`workspace name "${name}"`);
  return [...found];
}

/** The local mapping for names Slack doesn't mark up, if the maintainer keeps one. */
export async function readRedactions(): Promise<Record<string, string>> {
  const file = Bun.file(join(import.meta.dir, "..", "redact.local.json"));
  return (await file.exists()) ? ((await file.json()) as Record<string, string>) : {};
}
