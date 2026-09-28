import { useBlockKit } from "../context";
import { Tooltip } from "../Tooltip";
import { defaultEmojiImageUrl, resolveEmoji } from "./lookup";

export interface EmojiProps {
  /** Shortcode without colons, e.g. `"+1"` or `"basketball"`. */
  name: string;
  /** Fitzpatrick modifier 2-6, as in Slack's `skin-tone-N`. */
  skinTone?: number;
  /** Rendered width/height in px. Defaults to 22, Slack's inline size at 15px text. */
  size?: number;
}

/** Renders a `:name:` shortcode as an image, matching Slack exactly. Unknown names fall back to the literal text. */
export function Emoji({ name, skinTone, size = 22 }: EmojiProps) {
  const { emoji } = useBlockKit();
  const resolved = resolveEmoji(name, skinTone, emoji.custom);
  if (!resolved) return <>{`:${name}:`}</>;

  const src =
    resolved.kind === "custom"
      ? resolved.url
      : (emoji.imageUrl ?? defaultEmojiImageUrl)(resolved.unified);

  return (
    <Tooltip label={`:${name}:`}>
      <span className="sbk-emoji" style={{ width: size, height: size }}>
        <img
          className="sbk-emoji__img"
          src={src}
          alt={`:${name}:`}
          draggable={false}
          style={{ width: size, height: size, top: size / 2, marginTop: -size / 2 }}
        />
      </span>
    </Tooltip>
  );
}
