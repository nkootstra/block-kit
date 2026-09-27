import type { ImageBlock } from "@slack/types";
import { ImageActions } from "../data/HoverActions";
import { Text } from "../Text";
import type { BlockProps, Json } from "../types";

/** The caret Slack shows next to an image's file-size caption, used to expand the preview. */
function ExpandCaret() {
  return (
    <svg className="sbk-image__caret" viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
      <path
        d="M3.5 5.5l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * `image_url` renders directly. `slack_file` references a file in a workspace's file store —
 * without an authenticated `files.info` call we can't resolve it to a URL, so we render the
 * documented fallback (alt text in a placeholder box) instead of a broken `<img>`.
 *
 * Slack always shows a title row above the image with an expand caret and a "(N kB)" file-size
 * caption — the caption comes from fetching the file's real bytes, which isn't available to us
 * without a network round-trip, so we render the row (title + caret) but omit the byte count.
 * Keeping the row's height/spacing matches Slack's vertical rhythm even where the text differs.
 */
export function Image({ block }: BlockProps<ImageBlock>) {
  const json = block as unknown as Json;
  const imageUrl = "image_url" in block ? block.image_url : undefined;
  const slackFile = json.slack_file as { url?: string; id?: string } | undefined;

  return (
    <figure className="sbk-image">
      {imageUrl && (
        <div className="sbk-image__title">
          {block.title && (
            <span className="sbk-image__title-text">
              <Text text={block.title} />
            </span>
          )}
          <ExpandCaret />
        </div>
      )}
      <div
        className="sbk-image__frame sbk-hover-actions-host"
        style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` } : undefined}
      >
        {imageUrl ? (
          <img className="sbk-image__img" src={imageUrl} alt={block.alt_text} />
        ) : (
          <div className="sbk-image__fallback" role="img" aria-label={block.alt_text}>
            <span className="sbk-image__fallback-text">
              {slackFile ? "Slack file image unavailable" : block.alt_text}
            </span>
          </div>
        )}
        {imageUrl && <ImageActions url={imageUrl} />}
      </div>
    </figure>
  );
}
