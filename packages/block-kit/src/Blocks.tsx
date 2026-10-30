import type { AnyBlock } from "@slack/types";
import { Block, blockKey } from "./blocks/Block";
import type { Json } from "./types";

/** A list of blocks. Anything but an array renders an empty list, as no blocks would. */
export function Blocks({ blocks }: { blocks: readonly (AnyBlock | Json)[] }) {
  const list: readonly unknown[] = Array.isArray(blocks) ? blocks : [];
  return (
    <div className="sbk-blocks">
      {list.map((block, i) => (
        <Block key={blockKey(block, i)} block={block as Json} index={i} />
      ))}
    </div>
  );
}
