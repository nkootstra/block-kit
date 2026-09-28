import type { ActionsBlock } from "@slack/types";
import { Element } from "../elements/Element";
import type { BlockProps, Json } from "../types";

// Slack's Builder gives these element types their own full-width row in an actions block,
// stacked vertically, instead of letting them sit side-by-side with other actions like a button
// or select does. Confirmed via inspect.ts against catalog/actions/checkboxes and
// catalog/actions/radio-buttons (`p-actions_block__action--full_width`). A datetimepicker's two
// boxes stretch to fill the row too (extra/actions/more-elements).
const FULL_WIDTH_TYPES = new Set(["checkboxes", "radio_buttons", "datetimepicker"]);

export function Actions({ block, blockId }: BlockProps<ActionsBlock>) {
  return (
    <div className="sbk-actions">
      {(block.elements as unknown as Json[]).map((element, i) => {
        const fullWidth = FULL_WIDTH_TYPES.has(element.type as string);
        return (
          <div
            key={(element.action_id as string | undefined) ?? i}
            className={`sbk-actions__action${fullWidth ? " sbk-actions__action--full-width" : ""}`}
          >
            <Element element={element} blockId={blockId} />
          </div>
        );
      })}
    </div>
  );
}
