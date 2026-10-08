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

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
/** The sizes the snapshot freezes on an element, measured on whatever text it held then. */
const FROZEN_SIZE = new Set(["width", "max-width", "min-width", "flex-basis"]);
const isPlaceholderName = (text: string) =>
  MEMBER_PLACEHOLDER.test(text) || CHANNEL_PLACEHOLDER.test(text) || text === WORKSPACE_PLACEHOLDER;

/** A style attribute's declarations, split on `;` outside parentheses (data: URLs hold `;`). */
function declarations(style: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < style.length; i++) {
    const c = style[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth === 0) {
      out.push(style.slice(start, i));
      start = i + 1;
    }
  }
  out.push(style.slice(start));
  return out.filter((d) => d.trim() !== "");
}

/** A frozen size measured in pixels, as opposed to Slack's own `max-width:100%` or `min-width:0`. */
const MEASURED = /^\s*(?!0(?:px)?\s*$)[\d.]+px\s*$/;
/** The box in a member's row that fits its name, badge, presence and secondary name. */
const MEMBER_CONTENT = /\bclass="[^"]*\bc-member__primary_content\b/;

/**
 * The snapshot froze each element's width around the real name. A placeholder of another length
 * would be cut off or leave a gap, and whatever follows it (a presence dot, a status) would sit
 * where the real name ended. So the sizes frozen on the placeholder's own element, and on a
 * wrapper holding only that element, are released; the row around them keeps its width.
 *
 * A member's row in a select nests the name deeper: its box also holds a badge (AGENT, "(you)"),
 * and a presence dot and the secondary name follow it, all inside the member's primary content,
 * which was sized to fit them. There the measured sizes of every box around the name, up to and
 * including that primary content, are released too; the badge's and the dot's own sizes stay.
 */
function releaseNameWidths(html: string): string {
  interface Open {
    name: string;
    start: number;
    end: number;
    elements: number;
    text: boolean;
    holdsName: boolean;
    /** A placeholder name sits somewhere inside. */
    aroundName: boolean;
    memberContent: boolean;
  }
  const stack: Open[] = [];
  const release = new Set<number>();
  const releaseMeasured = new Set<number>();
  const tag = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const textBetween = (from: number, to: number) => {
    const text = unescapeHtml(html.slice(from, to)).replace(/\s+/g, " ").trim();
    const top = stack.at(-1);
    if (!text || !top) return;
    top.text = true;
    if (isPlaceholderName(text)) top.holdsName = top.aroundName = true;
  };
  while ((match = tag.exec(html))) {
    textBetween(last, match.index);
    last = tag.lastIndex;
    const closing = match[1] === "/";
    const name = (match[2] ?? "").toLowerCase();
    if (!closing) {
      const parent = stack.at(-1);
      if (parent) parent.elements++;
      if (name === "script" || name === "style") {
        const end = html.indexOf(`</${name}`, tag.lastIndex);
        tag.lastIndex = last = end < 0 ? html.length : end;
        stack.push({
          name,
          start: match.index,
          end: last,
          elements: 0,
          text: true,
          holdsName: false,
          aroundName: false,
          memberContent: false,
        });
        continue;
      }
      if (VOID_ELEMENTS.has(name) || match[0].endsWith("/>")) continue;
      stack.push({
        name,
        start: match.index,
        end: tag.lastIndex,
        elements: 0,
        text: false,
        holdsName: false,
        aroundName: false,
        memberContent: MEMBER_CONTENT.test(match[0]),
      });
      continue;
    }
    // Close back to the matching element.
    let open: Open | undefined;
    while ((open = stack.pop()) && open.name !== name) {}
    if (!open) continue;
    if (open.aroundName) {
      const parent = stack.at(-1);
      if (parent) parent.aroundName = true;
      if (open.memberContent || stack.some((o) => o.memberContent)) releaseMeasured.add(open.start);
    }
    if (open.holdsName && open.elements === 0) {
      release.add(open.start);
      const parent = stack.at(-1);
      if (parent) (parent as Open & { child?: number }).child = open.start;
    }
    const child = (open as Open & { child?: number }).child;
    if (child !== undefined && open.elements === 1 && !open.text) release.add(open.start);
  }
  if (release.size === 0 && releaseMeasured.size === 0) return html;
  let out = "";
  let at = 0;
  for (const start of [...new Set([...release, ...releaseMeasured])].sort((a, b) => a - b)) {
    const end = html.indexOf(">", start) + 1;
    const opening = html.slice(start, end).replace(/\bstyle="([^"]*)"/, (_, style: string) => {
      const kept = declarations(style).filter((d) => {
        const colon = d.indexOf(":");
        if (!FROZEN_SIZE.has(d.slice(0, colon).trim().toLowerCase())) return true;
        return !release.has(start) && !MEASURED.test(d.slice(colon + 1));
      });
      return `style="${kept.join(";")}"`;
    });
    out += html.slice(at, start) + opening;
    at = end;
  }
  return out + html.slice(at);
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

  out = releaseNameWidths(out);

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
