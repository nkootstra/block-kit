import type { SlackMessageLike, Surface } from "@nkootstra/block-kit";
import type { AnyBlock } from "@slack/types";
import { locateJsonError } from "./lib/jsonError";

type Obj = Record<string, unknown>;

/** A payload the preview can draw, whichever shape it was pasted in. */
export interface Payload {
  blocks: AnyBlock[];
  /**
   * The surface the payload names: a view's `type`, or `message` for a message body. Null for a
   * bare array of blocks, which could be any surface, so the preview keeps the one chosen.
   */
  surface: Surface | null;
  /** The view object, for a modal or Home tab (title, close, submit, callback_id…). */
  view?: Obj;
  /** What a message body carries besides blocks (fallback text, attachments, sender). */
  message?: SlackMessageLike;
  /** The payload as the shared link keeps it, in Block Kit Builder's format. */
  share: Obj;
}

export type PayloadProblem =
  | { kind: "empty" }
  | { kind: "syntax"; line?: number; column?: number }
  | { kind: "shape" };

export type ParseResult =
  | ({ ok: true } & Payload)
  | ({
      ok: false;
      /** The lead of the error bar, e.g. "This JSON doesn't parse:". */
      title: string;
      /** What's wrong, and where. */
      detail: string;
      /** `title` and `detail` together, as one sentence. */
      error: string;
    } & PayloadProblem);

const SURFACE_FIELDS = "blocks, text or attachments";
const EXPECTED =
  `Expected { "blocks": [...] }, a bare array of blocks, a chat.postMessage body (${SURFACE_FIELDS}), ` +
  `a view ({ "type": "modal" or "home", "blocks": [...] }) or a views.open, views.push, ` +
  `views.update or views.publish body ({ "view": {...} })`;

/** The fields of a chat.postMessage body the preview draws; the rest (channel, thread_ts…) don't show. */
const MESSAGE_FIELDS = ["blocks", "text", "attachments", "username", "icon_url", "icon_emoji"];

const isObject = (v: unknown): v is Obj => Boolean(v && typeof v === "object" && !Array.isArray(v));

const empty = (): ParseResult => ({
  ok: false,
  kind: "empty",
  title: "The editor is empty.",
  detail: 'Paste a payload, such as { "blocks": [...] }, or pick an example.',
  error: "The editor is empty.",
});

const shape = (detail: string): ParseResult => ({
  ok: false,
  kind: "shape",
  title: "This JSON parses but isn't a Block Kit payload:",
  detail,
  error: `This JSON parses but isn't a Block Kit payload: ${detail}`,
});

/** Why `blocks` (at `path`) can't be previewed, or undefined when it can. */
function blocksProblem(blocks: unknown, path: string): string | undefined {
  if (!Array.isArray(blocks)) return `"${path}" should be an array of blocks.`;
  const invalid = blocks.findIndex((b) => !isObject(b) || typeof b.type !== "string");
  if (invalid !== -1) return `${path}[${invalid}] should be an object with a string "type".`;
  return undefined;
}

function fromView(view: Obj, path: string): ParseResult {
  if (view.type !== "modal" && view.type !== "home") {
    return shape(
      `${path}.type should be "modal" or "home"${typeof view.type === "string" ? `, not "${view.type}"` : ""}.`,
    );
  }
  const blocks = view.blocks ?? [];
  const problem = blocksProblem(blocks, `${path}.blocks`.replace(/^\./, ""));
  if (problem) return shape(problem);
  return {
    ok: true,
    blocks: blocks as AnyBlock[],
    surface: view.type,
    view,
    share: view,
  };
}

function fromMessage(body: Obj): ParseResult {
  const blocks = body.blocks ?? [];
  const problem = blocksProblem(blocks, "blocks");
  if (problem) return shape(problem);
  if (body.text !== undefined && typeof body.text !== "string") {
    return shape('"text" should be a string.');
  }
  const attachments = body.attachments;
  if (attachments !== undefined) {
    if (!Array.isArray(attachments)) return shape('"attachments" should be an array.');
    for (const [i, attachment] of attachments.entries()) {
      if (!isObject(attachment)) return shape(`attachments[${i}] should be an object.`);
      if (attachment.blocks !== undefined) {
        const inner = blocksProblem(attachment.blocks, `attachments[${i}].blocks`);
        if (inner) return shape(inner);
      }
    }
  }
  const share: Obj = {};
  for (const key of MESSAGE_FIELDS) if (body[key] !== undefined) share[key] = body[key];
  const hasExtras = MESSAGE_FIELDS.some((key) => key !== "blocks" && body[key] !== undefined);
  return {
    ok: true,
    blocks: blocks as AnyBlock[],
    surface: "message",
    ...(hasExtras && {
      message: {
        // A chat.postMessage call is always from an app, so the preview keeps the APP badge and
        // the same name as a blocks-only preview unless the body sets its own `username`.
        bot_profile: { name: "Block Kit Preview" },
        ...(share as SlackMessageLike),
      },
    }),
    share,
  };
}

/**
 * Accepts what the About panel (index.html) promises: `{ "blocks": [...] }` or a bare array (as
 * Block Kit Builder does), a chat.postMessage body with blocks, text or attachments, a modal or
 * Home tab view, and the body of views.open, views.push, views.update or views.publish (its
 * `trigger_id`, `user_id`, `view_id`, `external_id` and `hash` don't change the preview).
 */
export function parsePayload(json: string): ParseResult {
  if (json.trim() === "") return empty();
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    const found = locateJsonError(json, (err as Error).message);
    const where = found.line !== undefined ? ` (line ${found.line}, column ${found.column})` : "";
    const detail = `${found.message}${where}.`;
    return {
      ok: false,
      kind: "syntax",
      line: found.line,
      column: found.column,
      title: "This JSON doesn't parse:",
      detail,
      error: `This JSON doesn't parse: ${detail}`,
    };
  }

  if (Array.isArray(value)) {
    const problem = blocksProblem(value, "blocks");
    if (problem) return shape(problem.replace(/^"blocks" should/, "The array should"));
    return { ok: true, blocks: value as AnyBlock[], surface: null, share: { blocks: value } };
  }
  if (!isObject(value)) return shape(`${EXPECTED}, not ${value === null ? "null" : typeof value}.`);

  // views.open / views.push / views.update / views.publish. Slack also takes `view` as a
  // JSON-encoded string (a form-encoded call sends it that way).
  if ("view" in value) {
    let view = value.view;
    if (typeof view === "string") {
      try {
        view = JSON.parse(view);
      } catch {
        return shape('"view" is a string that isn\'t JSON. It should be a view object.');
      }
    }
    if (!isObject(view)) return shape('"view" should be a view object, with "type" and "blocks".');
    return fromView(view, "view");
  }
  if (value.type === "modal" || value.type === "home") return fromView(value, "");

  const isMessage =
    value.type === undefined || value.type === "message"
      ? MESSAGE_FIELDS.some((key) => key !== "username" && key in value)
      : false;
  if (isMessage) return fromMessage(value);

  if (typeof value.type === "string") {
    return shape(
      `This looks like a single "${value.type}" block. Put it in an array, [ ... ], or in { "blocks": [ ... ] }.`,
    );
  }
  return shape(`${EXPECTED}.`);
}

/** Same hash format as Block Kit Builder, so URLs can be swapped between the two. */
export function builderUrl(json: string, teamId?: string): string {
  const base = `https://app.slack.com/block-kit-builder${teamId ? `/${teamId}` : ""}`;
  let compact = json;
  try {
    compact = JSON.stringify(JSON.parse(json));
  } catch {
    // Send as typed; Builder shows its own error.
  }
  return `${base}#${encodeURIComponent(compact)}`;
}

/** The JSON a shared link holds, formatted for the editor; null without one, or when it isn't JSON. */
export function readHash(hash = window.location.hash): string | null {
  const encoded = hash.replace(/^#/, "");
  if (!encoded) return null;
  try {
    return JSON.stringify(JSON.parse(decodeURIComponent(encoded)), null, 2);
  } catch {
    return null;
  }
}
