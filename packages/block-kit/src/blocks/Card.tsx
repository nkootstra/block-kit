import { Element } from "../elements/Element";
import { Text, type TextObject } from "../Text";
import { Tooltip } from "../Tooltip";
import type { BlockProps, Json } from "../types";
import { asObject, asString, objectsIn, own } from "../payloadValues";
import { imageUrl } from "../safeUrl";

/** Slack's inline icons by `slack_icon` name, their 20-unit paths as Slack ships them. */
const SLACK_ICONS: Record<string, string> = {
  calendar:
    "M4.5 4h11a.5.5 0 0 1 .5.5V6H4V4.5a.5.5 0 0 1 .5-.5M4 7.5v8a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-8zm-1.5-3a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zM14 9.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5m.75-3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0M13.25 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5m.75-3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0M10 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5m.75-3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0M10 10a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5",
  bug: "M11.92 1.077a.75.75 0 0 1 .66 1.346c-.28.138-.53.375-.72.656a2.49 2.49 0 0 1 .519 2.442c.86.296 1.614.82 2.19 1.501l.005-.001C15.356 6.832 16 6.06 16 5.25a.75.75 0 0 1 1.5 0c0 1.38-.926 2.598-2.13 3.086.245.59.38 1.236.38 1.914v.25c1.283-.042 2.592.787 3.15 1.918a.75.75 0 0 1-1.345.664c-.313-.636-1.103-1.112-1.772-1.083h-.033v.25c0 .914-.245 1.77-.673 2.507C16.18 15.293 17 16.45 17 17.75a.75.75 0 0 1-1.5 0c0-.809-.641-1.58-1.42-1.77a4.98 4.98 0 0 1-3.33 1.27h-1.5a4.98 4.98 0 0 1-3.33-1.27c-.779.19-1.42.961-1.42 1.77a.75.75 0 0 1-1.5 0c0-1.3.821-2.456 1.923-2.994a5 5 0 0 1-.673-2.506V12h-.033c-.675-.03-1.484.452-1.794 1.082a.75.75 0 1 1-1.346-.664c.562-1.137 1.896-1.96 3.173-1.919v-.25c0-.677.135-1.324.38-1.913C3.425 7.848 2.5 6.63 2.5 5.25a.75.75 0 1 1 1.5 0c0 .81.644 1.582 1.426 1.77l.005.002a5 5 0 0 1 2.19-1.5 2.5 2.5 0 0 1 .52-2.443 1.9 1.9 0 0 0-.722-.656.75.75 0 0 1 .662-1.346c.543.267 1.013.71 1.352 1.238a2.5 2.5 0 0 1 1.134 0c.34-.529.809-.971 1.352-1.238M9.25 6.75h1.5a3.5 3.5 0 0 1 3.5 3.5v2a3.5 3.5 0 0 1-3.5 3.5h-1.5a3.5 3.5 0 0 1-3.5-3.5v-2a3.5 3.5 0 0 1 3.5-3.5",
  lightbulb:
    "M5.5 7a4.5 4.5 0 0 1 9 0c0 1.666-.835 2.941-2.438 4.328a2.32 2.32 0 0 0-.812 1.747v1.175a.25.25 0 0 1-.25.25H9a.25.25 0 0 1-.25-.25v-1.175a2.32 2.32 0 0 0-.812-1.747C6.335 9.941 5.5 8.666 5.5 7M10 1a6 6 0 0 0-6 6c0 2.298 1.21 3.95 2.956 5.463.191.165.294.39.294.612v1.175c0 .966.784 1.75 1.75 1.75h2a1.75 1.75 0 0 0 1.75-1.75v-1.175c0-.222.102-.447.294-.612C14.79 10.95 16 9.298 16 7a6 6 0 0 0-6-6M8.75 17.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5z",
  "star-filled":
    "M9.99 1.5c-.635 0-1.125.363-1.468.754-.347.396-.63.914-.858 1.449-.358.84-.626 1.83-.797 2.723-.914-.1-1.887-.192-2.713-.159-.522.021-1.054.094-1.505.285-.471.2-.905.556-1.079 1.141-.177.598.004 1.155.28 1.595.272.434.678.826 1.111 1.168.665.524 1.487 1.001 2.262 1.39-.41.851-.832 1.886-1.093 2.858-.167.625-.28 1.272-.257 1.846.023.558.185 1.215.75 1.62.555.398 1.204.316 1.699.147.508-.172 1.031-.493 1.518-.849.75-.55 1.516-1.26 2.15-1.895.635.635 1.404 1.347 2.158 1.896.489.356 1.014.676 1.523.849.495.168 1.145.25 1.7-.148.567-.405.728-1.064.749-1.623.022-.575-.094-1.22-.264-1.846-.264-.972-.69-2.005-1.1-2.856.774-.39 1.594-.868 2.256-1.392.432-.342.837-.734 1.108-1.168.275-.439.456-.995.279-1.592-.174-.584-.607-.94-1.076-1.14-.45-.191-.982-.264-1.503-.285-.824-.034-1.795.058-2.708.158-.171-.893-.44-1.882-.798-2.723-.228-.535-.51-1.053-.857-1.449-.343-.39-.834-.754-1.468-.754",
  warning:
    "M10 12.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2m0-6a.75.75 0 0 1 .75.75V11a.75.75 0 0 1-1.5 0V7.5a.75.75 0 0 1 .75-.75 M7.712 3.542c1.02-1.723 3.556-1.723 4.576 0l6.1 10.303c1.043 1.761-.28 3.905-2.287 3.905H3.899c-2.007 0-3.33-2.144-2.288-3.905zm3.285.765c-.44-.742-1.554-.742-1.994 0l-6.1 10.302c-.418.704.084 1.641.996 1.641h12.202c.912 0 1.414-.937.997-1.642z",
  rocket:
    "m18.168 1.832.05.639c.257 3.278-1.016 7.195-5.445 9.976.2 1.025.257 1.866-.078 2.653-.376.881-1.2 1.57-2.327 2.443-.689.535-1.653.22-1.98-.506a11 11 0 0 0-2.229-3.197 11 11 0 0 0-3.196-2.229c-.728-.327-1.041-1.29-.507-1.98.874-1.127 1.562-1.95 2.444-2.326.786-.336 1.627-.28 2.652-.078 2.782-4.43 6.698-5.702 9.977-5.446zM16.749 3.25c-2.714-.008-5.882 1.24-8.182 5.197l-.276.475-.535-.12c-1.302-.289-1.845-.298-2.268-.118-.432.185-.865.615-1.688 1.663.848.405 2.148 1.16 3.42 2.432a12.6 12.6 0 0 1 2.433 3.42c1.048-.823 1.478-1.256 1.662-1.688.18-.423.171-.965-.118-2.267l-.12-.536.475-.276c3.957-2.3 5.206-5.468 5.197-8.182m-3.702 4.955c-.69 0-1.253-.563-1.253-1.252S12.357 5.7 13.047 5.7c.689 0 1.252.563 1.252 1.253 0 .689-.563 1.252-1.252 1.252M2.95 14.217c.597-.596 1.222-.485 1.952-.172a1 1 0 0 0-.081.071l-.809.809a.75.75 0 0 0 1.062 1.061l.808-.808a1 1 0 0 0 .071-.082c.313.73.425 1.356-.171 1.952-1.77 1.77-3.893 1.062-3.893 1.062s-.708-2.124 1.061-3.893",
};

/** A card's `icon` (an image element) or `slack_icon` (one of Slack's inline icons, by name). */
function CardIcon({ icon, slackIcon }: { icon?: Json; slackIcon?: Json }) {
  if (icon && icon.type === "image") {
    return (
      <img
        className="sbk-card__icon"
        src={imageUrl(icon.image_url)}
        alt={asString(icon.alt_text) ?? ""}
      />
    );
  }
  if (slackIcon) {
    const name = asString(slackIcon.name) ?? "";
    const glyph = own(SLACK_ICONS, name);
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
  const icon = asObject<Json>(json.icon);
  const slackIcon = asObject<Json>(json.slack_icon);
  const title = json.title as TextObject | undefined;
  const subtitle = json.subtitle as TextObject | undefined;
  const heroImage = asObject<Json>(json.hero_image);
  const body = json.body as TextObject | undefined;
  const subtext = json.subtext as TextObject | undefined;
  const actions = objectsIn<Json>(json.actions);

  return (
    <div className="sbk-card">
      <div className="sbk-card__box">
        <div className="sbk-card__content">
          {heroImage && (
            <img
              className="sbk-card__hero"
              src={imageUrl(heroImage.image_url)}
              alt={asString(heroImage.alt_text) ?? ""}
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
          {actions.length > 0 && (
            <div className="sbk-card__actions">
              {/* catalog/card-and-carousel/card-actions-and-content and extra/fidelity/card/mixed:
                  Slack orders a card's buttons danger, default, primary, each keeping the
                  payload's order, and pulls the danger ones into a left-aligned group. */}
              <div className="sbk-card__actions-start">
                {actions.map(
                  (action, i) =>
                    action.style === "danger" && (
                      <Element
                        key={asString(action.action_id) ?? i}
                        element={action}
                        blockId={blockId}
                      />
                    ),
                )}
              </div>
              {[
                ...actions.filter(
                  (action) => action.style !== "danger" && action.style !== "primary",
                ),
                ...actions.filter((action) => action.style === "primary"),
              ].map((action, i) => (
                <Element key={asString(action.action_id) ?? i} element={action} blockId={blockId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
