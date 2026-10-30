import { Unsupported } from "../elements/Unsupported";
import type { Json } from "../types";
import { blockComponents } from ".";
import { BlockBoundary } from "./BlockError";

/** The React key for a block in a list: its `block_id`, else its position. */
export function blockKey(block: unknown, index: number): string | number {
  const id = typeof block === "object" && block !== null ? (block as Json).block_id : undefined;
  return typeof id === "string" ? id : index;
}

/**
 * Renders one block. `index` is used for the generated block_id, as Slack does for blocks without
 * one. An entry that isn't an object (`null`, a string) renders nothing, and a block that throws
 * while rendering shows Slack's "This content could not be displayed." in its place.
 */
export function Block({ block, index }: { block: Json; index: number }) {
  if (typeof block !== "object" || block === null) return null;
  const blockId = typeof block.block_id === "string" ? block.block_id : `block-${index}`;
  const Component = blockComponents[block.type];
  return (
    <div className={`sbk-block sbk-block--${block.type}`} data-block-id={blockId}>
      {Component ? (
        <BlockBoundary block={block}>
          <Component block={block} blockId={blockId} index={index} />
        </BlockBoundary>
      ) : (
        <Unsupported type={block.type} />
      )}
    </div>
  );
}
