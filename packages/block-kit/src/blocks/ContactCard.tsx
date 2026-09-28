import { useBlockKit } from "../context";
import type { BlockProps, Json } from "../types";
import { useInContainer } from "./containerContext";

/**
 * Renders a workspace user as a contact tile. Resolving `contact_user_id` to a name/avatar needs
 * an authenticated `users.info` call; without a matching `resolvers.user`, we render the same
 * "unknown user" skeleton Slack's own Builder shows for an id it can't resolve either (see the
 * `catalog/callout/callout` reference, which uses a placeholder id).
 *
 * Inside a `container` (even nested in a callout there) Slack doesn't render the card at all and
 * shows its unknown-block notice instead (catalog/container/with-callout).
 */
export function ContactCard({ block }: BlockProps) {
  const json = block as Json;
  const userId = typeof json.contact_user_id === "string" ? json.contact_user_id : undefined;
  const { resolvers } = useBlockKit();
  const name = userId ? resolvers.user?.(userId) : undefined;
  const inContainer = useInContainer();

  if (inContainer) {
    return (
      <div className="sbk-block-error">
        <small className="sbk-block-error__message">This content could not be displayed.</small>
      </div>
    );
  }

  return (
    <div className="sbk-contact-card">
      <span className="sbk-contact-card__avatar" aria-hidden="true" />
      <div className="sbk-contact-card__body">
        {name ? (
          <span className="sbk-contact-card__name">{name}</span>
        ) : (
          <span className="sbk-contact-card__name sbk-contact-card__name--unknown">
            <span className="sbk-contact-card__skeleton" />
          </span>
        )}
        <span className="sbk-contact-card__meta">Contact</span>
      </div>
    </div>
  );
}
