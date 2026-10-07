import type { ImageBlock } from "@slack/types";
import { useState } from "react";
import { useBlockKit } from "../context";
import { ImageActions } from "../data/HoverActions";
import { Text } from "../Text";
import type { BlockProps, Json } from "../types";

/**
 * The caret Slack shows after an image's file-size caption: its icon font's filled triangle,
 * pointing down while shown and right while hidden. Paths are the font's glyphs (2000 units to the
 * em, 1700 above the baseline), so they sit in the 15px box exactly as Slack's glyph does.
 */
const CARET_GLYPHS = {
  down: "M1410 911C1463 971 1427 1050 1348 1050H652C573 1050 537 971 590 911L937 521C972 481 1028 481 1063 521Z",
  right:
    "M1279 687C1319 722 1319 778 1279 813L889 1160C829 1213 750 1177 750 1098V402C750 323 829 287 889 340Z",
};

function ExpandCaret({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={expanded ? "sbk-image__caret" : "sbk-image__caret sbk-image__caret--collapsed"}
      viewBox="0 0 2000 2000"
      aria-hidden="true"
    >
      <path
        transform="matrix(1 0 0 -1 0 1700)"
        fill="currentColor"
        d={expanded ? CARET_GLYPHS.down : CARET_GLYPHS.right}
      />
    </svg>
  );
}

/**
 * `image_url` renders directly. `slack_file` references a file in a workspace's file store, which
 * the app resolves through `resolvers.slackFile` (e.g. with `files.info`); a resolved file renders
 * like an `image_url`, and without a resolver (or for a file it doesn't know) the documented
 * fallback shows instead (alt text in a placeholder box) rather than a broken `<img>`.
 *
 * Slack always shows a title row above the image with an expand caret and a "(N kB)" file-size
 * caption, the size coming from the file's bytes. We show it when the resolver gives a size; for
 * an `image_url` we can't know the size without a network round-trip, so the row keeps its
 * height and spacing without it.
 *
 * The caret is a toggle, as in Slack: pressing it hides the image (instantly, no animation) and
 * leaves only the title row, and pressing it again brings the image back.
 */
export function Image({ block }: BlockProps<ImageBlock>) {
  const json = block as unknown as Json;
  const directUrl = "image_url" in block ? block.image_url : undefined;
  const slackFile = json.slack_file as { url?: string; id?: string } | undefined;
  const { resolvers } = useBlockKit();
  const resolved = slackFile ? resolvers.slackFile?.(slackFile) : undefined;
  const imageUrl = directUrl ?? resolved?.url;
  const [expanded, setExpanded] = useState(true);

  return (
    <figure className="sbk-image">
      {imageUrl && (
        <div className="sbk-image__title">
          {block.title && (
            <span className="sbk-image__title-text">
              <Text text={block.title} />
            </span>
          )}
          <span className="sbk-image__trigger">
            {resolved?.size !== undefined && `(${formatFileSize(resolved.size)})`}{" "}
            <button
              type="button"
              className="sbk-image__toggle"
              aria-label="image"
              aria-expanded={expanded}
              title={expanded ? "Collapse" : "Expand"}
              onClick={() => setExpanded((value) => !value)}
            >
              <ExpandCaret expanded={expanded} />
            </button>
          </span>
        </div>
      )}
      {expanded && (
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
      )}
    </figure>
  );
}

/**
 * Slack's file-size caption: whole kilobytes, as measured ("(71 kB)" for 72,704 bytes). Larger
 * files read in megabytes with one decimal; no Builder sample shows that case.
 */
function formatFileSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} kB` : `${(kb / 1024).toFixed(1)} MB`;
}
