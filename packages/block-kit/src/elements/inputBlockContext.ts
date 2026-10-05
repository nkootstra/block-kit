import { createContext, useContext } from "react";

/** True while rendering the element of an `input` block, where Slack lays some elements out differently. */
export const InputBlockContext = createContext(false);

export function useInInputBlock(): boolean {
  return useContext(InputBlockContext);
}

/** The id of the error shown under an `input` block's element, while it has one. */
export const InputErrorContext = createContext<string | undefined>(undefined);

/**
 * Props for the element's focusable control: an `input` block with an error marks it invalid,
 * which also gives it Slack's red focus ring, and describes it with the error text.
 */
export function useInvalidProps(): { "aria-invalid"?: true; "aria-describedby"?: string } {
  const errorId = useContext(InputErrorContext);
  return errorId ? { "aria-invalid": true, "aria-describedby": errorId } : {};
}
