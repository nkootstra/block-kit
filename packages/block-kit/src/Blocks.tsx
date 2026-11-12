import type { AnyBlock } from "@slack/types";
import { Block } from "./blocks/Block";
import { asString, inert, objectsIn } from "./payloadValues";
import type { Json } from "./types";

export function Blocks({ blocks }: { blocks: readonly (AnyBlock | Json)[] }) {
  return (
    <div className="sbk-blocks">
      {objectsIn<Json>(inert(blocks)).map((block, i) => (
        <Block key={asString(block.block_id) ?? i} block={block} index={i} />
      ))}
    </div>
  );
}
