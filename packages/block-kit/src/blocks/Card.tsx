import { Element } from "../elements/Element";
import { Text, type TextObject } from "../Text";
import { Tooltip } from "../Tooltip";
import type { BlockProps, Json } from "../types";

/** A card's `icon` (an image element) or `slack_icon` (an icon-font glyph we can't ship). */
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
    // Slack's icon font glyph (e.g. "rocket") isn't available to us; a neutral badge stands in.
    return (
      <Tooltip label={slackIcon.name as string}>
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
