import { createContext, useContext } from "react";
import { useBlockKit } from "../context";

/** True while rendering the element of an `input` block, where Slack lays some elements out differently. */
export const InputBlockContext = createContext(false);

export function useInInputBlock(): boolean {
  return useContext(InputBlockContext);
}

/** True while rendering the element of an `input` block marked `optional`, which Slack lets the user empty. */
export const InputOptionalContext = createContext(false);

export function useInOptionalInput(): boolean {
  return useContext(InputOptionalContext);
}

/**
 * True for an `input` block's element that Slack lets the user empty with "Clear selection": an
 * optional input, or any input on the message surface, where Slack treats inputs as optional (it
 * shows no "(optional)" suffix there either). Measured in Block Kit Builder's references.
 */
export function useInClearableInput(): boolean {
  const inInput = useContext(InputBlockContext);
  const optional = useContext(InputOptionalContext);
  const { surface } = useBlockKit();
  return inInput && (optional || surface === "message");
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
