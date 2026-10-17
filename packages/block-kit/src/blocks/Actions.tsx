import type { ActionsBlock } from "@slack/types";
import { useState } from "react";
import { Element } from "../elements/Element";
import type { BlockProps, Json } from "../types";

// Slack's Builder gives these element types their own full-width row in an actions block,
// stacked vertically, instead of letting them sit side-by-side with other actions like a button
// or select does. Confirmed via inspect.ts against catalog/actions/checkboxes and
// catalog/actions/radio-buttons (`p-actions_block__action--full_width`). A datetimepicker's two
// boxes stretch to fill the row too (extra/actions/more-elements).
const FULL_WIDTH_TYPES = new Set(["checkboxes", "radio_buttons", "datetimepicker"]);

// Slack shows the first five elements and a "+ N more" button for the rest
// (`bk_actions_block_truncation`, extra/fidelity/actions/many-items).
const VISIBLE_ELEMENTS = 5;

export function Actions({ block, blockId }: BlockProps<ActionsBlock>) {
  const [expanded, setExpanded] = useState(false);
  const elements = block.elements as unknown as Json[];
  const hidden = expanded ? 0 : Math.max(0, elements.length - VISIBLE_ELEMENTS);
  return (
    <div className="sbk-actions">
      {elements.slice(0, elements.length - hidden).map((element, i) => {
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
      {hidden > 0 && (
        <div className="sbk-actions__action">
          <button
            type="button"
            className="sbk-button sbk-actions__more"
            onClick={() => setExpanded(true)}
          >
            {`+ ${hidden} more`}
          </button>
        </div>
      )}
    </div>
  );
}
