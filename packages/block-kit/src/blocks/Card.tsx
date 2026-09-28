import { Element } from "../elements/Element";
import { Text, type TextObject } from "../Text";
import { Tooltip } from "../Tooltip";
import type { BlockProps, Json } from "../types";

/** Slack's inline icons by `slack_icon` name, their 20-unit paths as Slack ships them. */
const SLACK_ICONS: Record<string, string> = {
  rocket:
    "m18.168 1.832.05.639c.257 3.278-1.016 7.195-5.445 9.976.2 1.025.257 1.866-.078 2.653-.376.881-1.2 1.57-2.327 2.443-.689.535-1.653.22-1.98-.506a11 11 0 0 0-2.229-3.197 11 11 0 0 0-3.196-2.229c-.728-.327-1.041-1.29-.507-1.98.874-1.127 1.562-1.95 2.444-2.326.786-.336 1.627-.28 2.652-.078 2.782-4.43 6.698-5.702 9.977-5.446zM16.749 3.25c-2.714-.008-5.882 1.24-8.182 5.197l-.276.475-.535-.12c-1.302-.289-1.845-.298-2.268-.118-.432.185-.865.615-1.688 1.663.848.405 2.148 1.16 3.42 2.432a12.6 12.6 0 0 1 2.433 3.42c1.048-.823 1.478-1.256 1.662-1.688.18-.423.171-.965-.118-2.267l-.12-.536.475-.276c3.957-2.3 5.206-5.468 5.197-8.182m-3.702 4.955c-.69 0-1.253-.563-1.253-1.252S12.357 5.7 13.047 5.7c.689 0 1.252.563 1.252 1.253 0 .689-.563 1.252-1.252 1.252M2.95 14.217c.597-.596 1.222-.485 1.952-.172a1 1 0 0 0-.081.071l-.809.809a.75.75 0 0 0 1.062 1.061l.808-.808a1 1 0 0 0 .071-.082c.313.73.425 1.356-.171 1.952-1.77 1.77-3.893 1.062-3.893 1.062s-.708-2.124 1.061-3.893",
};

/** A card's `icon` (an image element) or `slack_icon` (one of Slack's inline icons, by name). */
function CardIcon({ icon, slackIcon }: { icon?: Json; slackIcon?: Json }) {
  if (icon && icon.type === "image") {
    return (
      <img
        className="sbk-card__icon"
        src={"image_url" in icon ? (icon.image_url as string) : undefined}
        alt={(icon.alt_text as string) ?? ""}
      />
    );
  }
  if (slackIcon) {
    const name = slackIcon.name as string;
    const glyph = SLACK_ICONS[name];
    if (glyph) {
      return (
        <span className="sbk-card__icon sbk-card__icon--slack">
          <svg viewBox="0 0 20 20" width="24" height="24" aria-hidden="true">
            <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d={glyph} />
          </svg>
        </span>
      );
    }
    // An icon we have no glyph for: a neutral badge stands in, named on hover.
    return (
      <Tooltip label={name}>
        <span className="sbk-card__icon sbk-card__icon--fallback">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </Tooltip>
    );
  }
  return null;
}

/**
 * Renders one `card` block. Also used by `Carousel` for its `elements[]`, since a carousel is a
 * horizontally-scrolling row of the same card content.
 */
export function Card({ block, blockId }: BlockProps) {
  const json = block as Json;
  const icon = json.icon as Json | undefined;
  const slackIcon = json.slack_icon as Json | undefined;
  const title = json.title as TextObject | undefined;
  const subtitle = json.subtitle as TextObject | undefined;
  const heroImage = json.hero_image as Json | undefined;
  const body = json.body as TextObject | undefined;
  const subtext = json.subtext as TextObject | undefined;
  const actions = json.actions as Json[] | undefined;

  return (
    <div className="sbk-card">
      <div className="sbk-card__box">
        <div className="sbk-card__content">
          {heroImage && (
            <img
              className="sbk-card__hero"
              src={"image_url" in heroImage ? (heroImage.image_url as string) : undefined}
              alt={(heroImage.alt_text as string) ?? ""}
            />
          )}
          {(icon || slackIcon || title || subtitle) && (
            <div className="sbk-card__header">
              <CardIcon icon={icon} slackIcon={slackIcon} />
              {(title || subtitle) && (
                <div className="sbk-card__titles">
                  {title && (
                    <div className="sbk-card__title">
                      <Text text={title} />
                    </div>
                  )}
                  {subtitle && (
                    <div className="sbk-card__subtitle">
                      <Text text={subtitle} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {body && (
            <div className="sbk-card__body">
              <Text text={body} />
            </div>
          )}
          {subtext && (
            <div className="sbk-card__subtext">
              <Text text={subtext} />
            </div>
          )}
          {actions && actions.length > 0 && (
            <div className="sbk-card__actions">
              {/* Slack pulls danger buttons into a left-aligned group; the rest stay right-aligned
                  in their original order. */}
              <div className="sbk-card__actions-start">
                {actions.map(
                  (action, i) =>
                    action.style === "danger" && (
                      <Element
                        key={(action.action_id as string | undefined) ?? i}
                        element={action}
                        blockId={blockId}
                      />
                    ),
                )}
              </div>
              {actions.map(
                (action, i) =>
                  action.style !== "danger" && (
                    <Element
                      key={(action.action_id as string | undefined) ?? i}
                      element={action}
                      blockId={blockId}
                    />
                  ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
