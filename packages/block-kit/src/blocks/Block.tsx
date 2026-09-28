import { Unsupported } from "../elements/Unsupported";
import type { Json } from "../types";
import { blockComponents } from ".";

/** Renders one block. `index` is used for the generated block_id, as Slack does for blocks without one. */
export function Block({ block, index }: { block: Json; index: number }) {
  const blockId = typeof block.block_id === "string" ? block.block_id : `block-${index}`;
  const Component = blockComponents[block.type];
  return (
    <div className={`sbk-block sbk-block--${block.type}`} data-block-id={blockId}>
      {Component ? (
        <Component block={block} blockId={blockId} index={index} />
      ) : (
        <Unsupported type={block.type} />
      )}
    </div>
  );
}
