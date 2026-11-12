import type { ContextBlock } from "@slack/types";
import { Text, type TextObject } from "../Text";
import { asString, objectsIn } from "../payloadValues";
import { imageUrl } from "../safeUrl";
import type { BlockProps } from "../types";

export function Context({ block }: BlockProps<ContextBlock>) {
  return (
    <div className="sbk-context">
      {objectsIn<ContextBlock["elements"][number]>(block.elements).map((el, i) =>
        el.type === "image" ? (
          <img
            key={i}
            className="sbk-context__image"
            src={"image_url" in el ? imageUrl(el.image_url) : undefined}
            alt={asString(el.alt_text)}
          />
        ) : (
          <span key={i} className="sbk-context__text">
            <Text text={el as TextObject} emojiSize={16} />
          </span>
        ),
      )}
    </div>
  );
}
