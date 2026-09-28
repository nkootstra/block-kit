import type { AnyBlock } from "@slack/types";
import { Block } from "./blocks/Block";
import type { Json } from "./types";

export function Blocks({ blocks }: { blocks: readonly (AnyBlock | Json)[] }) {
  return (
    <div className="sbk-blocks">
      {blocks.map((block, i) => (
        <Block key={(block.block_id as string | undefined) ?? i} block={block as Json} index={i} />
      ))}
    </div>
  );
}
