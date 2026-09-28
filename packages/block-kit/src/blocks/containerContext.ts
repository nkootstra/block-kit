import { createContext, useContext } from "react";

/** True for blocks rendered anywhere inside a `container` block's `child_blocks`. */
export const InContainerContext = createContext(false);

export function useInContainer(): boolean {
  return useContext(InContainerContext);
}
