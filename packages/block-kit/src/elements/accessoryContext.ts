import { createContext } from "react";

/**
 * True for an element rendered as a section block's accessory. Slack draws some elements
 * differently there: a multi-select becomes a small button that opens a "Select options" dialog.
 */
export const SectionAccessoryContext = createContext(false);
