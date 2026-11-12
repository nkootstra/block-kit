import { inert } from "../payloadValues";
import type { Json } from "../types";
import { elementComponents } from ".";
import { Unsupported } from "./Unsupported";

/** Renders any interactive or image element. Unsupported types render a visible placeholder. */
export function Element({ element: elementProp, blockId }: { element: Json; blockId: string }) {
  // `Element` is exported, so an element can arrive without passing through a block.
  const element = inert(elementProp);
  // Own keys only, as in Block: inline because the static-components lint reads `own()` as a
  // component created during render.
  const Component =
    typeof element.type === "string" && Object.hasOwn(elementComponents, element.type)
      ? elementComponents[element.type]
      : undefined;
  if (!Component) return <Unsupported type={element.type} />;
  return <Component element={element} blockId={blockId} />;
}
