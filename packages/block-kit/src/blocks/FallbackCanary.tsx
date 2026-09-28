import type { BlockProps, Json } from "../types";
import { Block } from "./Block";

/**
 * The Block Kit "fallback" convention: a block type this renderer doesn't know renders its
 * producer-supplied `fallback` blocks in place instead of being dropped. `fallback_canary` is a
 * synthetic type used to test that convention itself (see `catalog/reference/fallback-canary`);
 * an unrecognized real block type with a `fallback` array should be handled the same way, but
 * this library's registry always maps a known type, so the canary is what exercises the path.
 *
 * Slack renders the whole fallback list inside the one block wrapper it gave the unknown block,
 * and that wrapper is a flex row, so the fallback blocks sit side by side rather than stacking.
 */
export function FallbackCanary({ block }: BlockProps) {
  const fallback = ((block as Json).fallback as Json[] | undefined) ?? [];
  return (
    <div className="sbk-fallback-canary">
      {fallback.map((child, i) => (
        <Block key={(child.block_id as string | undefined) ?? i} block={child} index={i} />
      ))}
    </div>
  );
}
