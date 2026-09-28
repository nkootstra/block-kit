import type { ContextBlock } from "@slack/types";
import { Text, type TextObject } from "../Text";
import type { BlockProps } from "../types";

export function Context({ block }: BlockProps<ContextBlock>) {
  return (
    <div className="sbk-context">
      {block.elements.map((el, i) =>
        el.type === "image" ? (
          <img
            key={i}
            className="sbk-context__image"
            src={"image_url" in el ? el.image_url : undefined}
            alt={el.alt_text}
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
