import type { ImageElement as ImageElementType } from "@slack/types";
import { useBlockKit } from "../context";
import type { ElementProps, Json } from "../types";

/** An image element; a `slack_file` one shows through `resolvers.slackFile`, like the image block. */
export function ImageElement({ element }: ElementProps<ImageElementType>) {
  const { resolvers } = useBlockKit();
  const slackFile = (element as unknown as Json).slack_file as
    | { url?: string; id?: string }
    | undefined;
  const src =
    "image_url" in element
      ? element.image_url
      : slackFile
        ? resolvers.slackFile?.(slackFile)?.url
        : undefined;
  return <img className="sbk-image-element" src={src} alt={element.alt_text} />;
}
