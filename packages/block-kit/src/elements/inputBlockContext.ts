import { createContext, useContext } from "react";

/** True while rendering the element of an `input` block, where Slack lays some elements out differently. */
export const InputBlockContext = createContext(false);

export function useInInputBlock(): boolean {
  return useContext(InputBlockContext);
}
