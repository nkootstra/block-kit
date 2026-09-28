import type { SectionBlock } from "@slack/types";
import { useState } from "react";
import { Element } from "../elements/Element";
import { Text } from "../Text";
import type { BlockProps, Json } from "../types";

/**
 * Long section text is clamped unless `expand: true`. There's no Builder reference for the exact
 * truncation length, so this mirrors the documented behaviour (a "Show more" toggle) with a
 * reasonable clamp rather than Slack's precise measurement.
 */
const COLLAPSE_LINES = 5;
const COLLAPSE_CHAR_THRESHOLD = 300;

/** Accessories Slack stacks full-width below the text instead of beside it. */
const STACKED_ACCESSORIES = new Set(["checkboxes", "radio_buttons"]);

export function Section({ block, blockId }: BlockProps<SectionBlock>) {
  const accessory = block.accessory as Json | undefined;
  const expand = (block as unknown as Json).expand === true;
  const textLength = block.text?.text.length ?? 0;
  const collapsible = !expand && textLength > COLLAPSE_CHAR_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const stacked = accessory !== undefined && STACKED_ACCESSORIES.has(accessory.type as string);

  return (
    <div
      className={`sbk-section${accessory ? " sbk-section--has-accessory" : ""}${stacked ? " sbk-section--stacked" : ""}`}
    >
      <div className="sbk-section__content">
        {block.text && (
          <div
            className={`sbk-section__text${collapsible && !expanded ? " sbk-section__text--clamped" : ""}`}
            style={collapsible && !expanded ? { WebkitLineClamp: COLLAPSE_LINES } : undefined}
          >
            <Text text={block.text} />
            {collapsible && (
              <button
                type="button"
                className="sbk-section__toggle"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {block.fields && (
          <div className="sbk-section__fields">
            {block.fields.map((field, i) => (
              <div key={i} className="sbk-section__field">
                <Text text={field} />
              </div>
            ))}
          </div>
        )}
      </div>
      {accessory && (
        <div className={`sbk-section__accessory sbk-section__accessory--${accessory.type}`}>
          <Element element={accessory} blockId={blockId} />
        </div>
      )}
    </div>
  );
}
