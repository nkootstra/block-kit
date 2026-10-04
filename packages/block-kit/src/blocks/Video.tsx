import { Text, type TextObject } from "../Text";
import type { BlockProps, Json } from "../types";
import { Link } from "../Link";

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M6 4.3a1 1 0 0 1 1.5-.9l8.6 5.7a1 1 0 0 1 0 1.8l-8.6 5.7A1 1 0 0 1 6 15.7z"
        fill="currentColor"
      />
    </svg>
  );
}

function CaretDownIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
      <path d="M5.5 8l4.5 4.5L14.5 8z" fill="currentColor" />
    </svg>
  );
}

/**
 * A video preview: author/provider row, description, title link, and a thumbnail with Slack's
 * "Video" play pill. We render the thumbnail rather than an embedded player — `video_url` is opened in a
 * new tab, matching how a message-surface preview behaves before the player is expanded.
 */
export function Video({ block }: BlockProps) {
  const json = block as Json;
  const title = json.title as TextObject | undefined;
  const titleUrl = typeof json.title_url === "string" ? json.title_url : undefined;
  const description = json.description as TextObject | undefined;
  const authorName = typeof json.author_name === "string" ? json.author_name : undefined;
  const providerName = typeof json.provider_name === "string" ? json.provider_name : undefined;
  const providerIcon =
    typeof json.provider_icon_url === "string" ? json.provider_icon_url : undefined;
  const thumbnailUrl = typeof json.thumbnail_url === "string" ? json.thumbnail_url : undefined;
  const altText = typeof json.alt_text === "string" ? json.alt_text : (title?.text ?? "video");

  return (
    <div className="sbk-video">
      {(providerName || authorName) && (
        <div className="sbk-video__byline">
          {providerIcon && <img className="sbk-video__provider-icon" src={providerIcon} alt="" />}
          {providerName && <span className="sbk-video__provider">{providerName}</span>}
          {providerName && authorName && <span className="sbk-video__separator"> | </span>}
          {authorName && <span className="sbk-video__author">{authorName}</span>}
        </div>
      )}
      {description && (
        <div className="sbk-video__description">
          <Text text={description} />
        </div>
      )}
      {title && (
        <div className="sbk-video__title">
          {titleUrl ? (
            <Link href={titleUrl} target="_blank" rel="noreferrer">
              <Text text={title} />
            </Link>
          ) : (
            <Text text={title} />
          )}
          <span className="sbk-video__expand" aria-hidden="true">
            <CaretDownIcon />
          </span>
        </div>
      )}
      <Link
        className="sbk-video__frame"
        href={typeof json.video_url === "string" ? (json.video_url as string) : titleUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={altText}
      >
        {thumbnailUrl && <img className="sbk-video__thumb" src={thumbnailUrl} alt="" />}
        <span className="sbk-video__play">
          <PlayIcon />
          <span className="sbk-video__play-label">Video</span>
        </span>
      </Link>
    </div>
  );
}
