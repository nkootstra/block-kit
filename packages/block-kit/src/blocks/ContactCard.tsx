import { useBlockKit } from "../context";
import type { BlockProps, Json } from "../types";
import { useInContainer } from "./containerContext";

/**
 * Renders a workspace user as a contact tile. Resolving `contact_user_id` to a name/avatar needs
 * an authenticated `users.info` call. Slack shows a skeleton while that lookup is pending and its
 * "could not be displayed" notice once the user turns out not to exist (both appear in the
 * `extra/fidelity/contact-card/mixed` reference). So without a `resolvers.user` the lookup counts
 * as pending (skeleton); when `resolvers.user` is given and doesn't know the id, the user doesn't
 * exist (notice). The meta line is the workspace's name, `identity.teamName`, or "Contact".
 *
 * Inside a `container` (even nested in a callout there) Slack doesn't render the card at all and
 * shows its unknown-block notice instead (catalog/container/with-callout).
 */
export function ContactCard({ block }: BlockProps) {
  const json = block as Json;
  const userId = typeof json.contact_user_id === "string" ? json.contact_user_id : undefined;
  const { resolvers, identity } = useBlockKit();
  const name = userId ? resolvers.user?.(userId) : undefined;
  const inContainer = useInContainer();
  const missing = resolvers.user !== undefined && !name;

  if (inContainer || missing) {
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
        <span className="sbk-contact-card__meta">{identity.teamName || "Contact"}</span>
      </div>
    </div>
  );
}
