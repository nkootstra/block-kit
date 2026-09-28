import { Element } from "../elements/Element";
import type { BlockProps, Json } from "../types";

/**
 * A trailing row of small icon-style actions (feedback thumbs-up/down, copy, retry, overflow…),
 * typically under an AI-generated message. The individual element rendering (feedback_buttons,
 * icon_button, overflow, ...) is owned by the elements layer; this just lays the row out.
 */
export function ContextActions({ block, blockId }: BlockProps) {
  const elements = ((block as Json).elements as Json[] | undefined) ?? [];
  return (
    <div className="sbk-context-actions">
      {elements.map((element, i) => (
        <div
          key={(element.action_id as string | undefined) ?? i}
          className="sbk-context-actions__item"
        >
          <Element element={element} blockId={blockId} />
        </div>
      ))}
    </div>
  );
}
