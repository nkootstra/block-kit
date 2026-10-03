import type { HomeTabView, MessageProps, ModalView } from "@nkootstra/block-kit";

type AnyBlock = NonNullable<MessageProps["blocks"]>[number];

export type Payload =
  | { ok: true; surface: "message"; blocks: AnyBlock[] }
  | { ok: true; surface: "modal" | "home"; view: ModalView | HomeTabView }
  | { ok: false; error: string };

/**
 * Reads a fixture the way the playground's render page does (apps/playground/src/RenderOnly.tsx):
 * a `view` (`type: "modal"` or `"home"`) renders through `<View>` with a fixed id, anything else
 * must be what Block Kit Builder accepts, `{ "blocks": [...] }` or a bare array of blocks.
 */
export function readPayload(json: string): Payload {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const type = value && typeof value === "object" && "type" in value ? value.type : undefined;
  if (type === "modal" || type === "home") {
    return {
      ok: true,
      surface: type,
      view: { id: "V00000000", ...(value as object) } as ModalView | HomeTabView,
    };
  }
  const blocks = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "blocks" in value
      ? value.blocks
      : undefined;
  if (!Array.isArray(blocks))
    return { ok: false, error: 'Expected { "blocks": [...] } or an array' };
  const invalid = blocks.findIndex(
    (b) => !b || typeof b !== "object" || typeof b.type !== "string",
  );
  if (invalid !== -1) return { ok: false, error: `blocks[${invalid}] needs a string "type"` };
  return { ok: true, surface: "message", blocks: blocks as AnyBlock[] };
}
