import type { ImageElement as ImageElementType } from "@slack/types";
import type { ElementProps } from "../types";

export function ImageElement({ element }: ElementProps<ImageElementType>) {
  return (
    <img
      className="sbk-image-element"
      src={"image_url" in element ? element.image_url : undefined}
      alt={element.alt_text}
    />
  );
}
