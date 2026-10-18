import type { SectionBlock } from "@slack/types";
import { SectionAccessoryContext } from "../elements/accessoryContext";
import { Element } from "../elements/Element";
import { Text } from "../Text";
import type { BlockProps, Json } from "../types";

/** Accessories Slack stacks full-width below the text instead of beside it. */
const STACKED_ACCESSORIES = new Set(["checkboxes", "radio_buttons"]);

export function Section({ block, blockId }: BlockProps<SectionBlock>) {
  const accessory = block.accessory as Json | undefined;
  const stacked = accessory !== undefined && STACKED_ACCESSORIES.has(accessory.type as string);

  return (
    <div
      className={`sbk-section${accessory ? " sbk-section--has-accessory" : ""}${stacked ? " sbk-section--stacked" : ""}`}
    >
      <div className="sbk-section__content">
        {/* All of the text, however long, as Block Kit Builder draws it (section/long-content,
            show-more); `expand` changes nothing there, so it's ignored here. */}
        {block.text && (
          <div className="sbk-section__text">
            <Text text={block.text} />
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
          <SectionAccessoryContext.Provider value={true}>
            <Element element={accessory} blockId={blockId} />
          </SectionAccessoryContext.Provider>
        </div>
      )}
    </div>
  );
}
