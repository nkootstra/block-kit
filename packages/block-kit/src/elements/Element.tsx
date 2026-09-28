import type { Json } from "../types";
import { elementComponents } from ".";
import { Unsupported } from "./Unsupported";

/** Renders any interactive or image element. Unsupported types render a visible placeholder. */
export function Element({ element, blockId }: { element: Json; blockId: string }) {
  const Component = elementComponents[element.type];
  if (!Component) return <Unsupported type={element.type} />;
  return <Component element={element} blockId={blockId} />;
}
