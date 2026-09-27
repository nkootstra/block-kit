import type { AnyBlock } from "@slack/types";

export type ParseResult = { ok: true; blocks: AnyBlock[] } | { ok: false; error: string };

/** Accepts what Block Kit Builder accepts: `{ "blocks": [...] }` or a bare array of blocks. */
export function parsePayload(json: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const blocks = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "blocks" in value
      ? (value as { blocks: unknown }).blocks
      : undefined;
  if (!Array.isArray(blocks))
    return { ok: false, error: 'Expected { "blocks": [...] } or an array' };
  const invalid = blocks.findIndex(
    (b) => !b || typeof b !== "object" || typeof b.type !== "string",
  );
  if (invalid !== -1) return { ok: false, error: `blocks[${invalid}] needs a string "type"` };
  return { ok: true, blocks: blocks as AnyBlock[] };
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

export function readHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  try {
    return JSON.stringify(JSON.parse(decodeURIComponent(hash)), null, 2);
  } catch {
    return null;
  }
}
