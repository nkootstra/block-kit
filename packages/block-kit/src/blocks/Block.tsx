import { createContext, useContext } from "react";
import { classModifier } from "../payloadValues";
import { Unsupported } from "../elements/Unsupported";
import type { Json } from "../types";
import { blockComponents } from ".";

/**
 * How many blocks deep the nesting goes before the rest is left out. Callouts, containers and
 * conditions hold blocks of their own, and a payload nesting them thousands deep would overflow the
 * stack; Slack's own nesting is a few levels.
 */
const MAX_DEPTH = 32;
const DepthContext = createContext(0);

/** Renders one block. `index` is used for the generated block_id, as Slack does for blocks without one. */
export function Block({ block, index }: { block: Json; index: number }) {
  const depth = useContext(DepthContext);
  if (depth >= MAX_DEPTH) return null;
  const blockId = typeof block.block_id === "string" ? block.block_id : `block-${index}`;
  // Own keys only: a type of "constructor" would find a function on Object.prototype. Inline rather
  // than `own()`, which the static-components lint reads as a component created during render.
  const Component =
    typeof block.type === "string" && Object.hasOwn(blockComponents, block.type)
      ? blockComponents[block.type]
      : undefined;
  return (
    <div
      className={`sbk-block sbk-block--${classModifier(block.type) ?? "unsupported"}`}
      data-block-id={blockId}
    >
      <DepthContext.Provider value={depth + 1}>
        {Component ? (
          <Component block={block} blockId={blockId} index={index} />
        ) : (
          <Unsupported type={block.type} />
        )}
      </DepthContext.Provider>
    </div>
  );
}
