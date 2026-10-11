import type { ReactNode } from "react";
import { type LinkProps, type MentionRef, useBlockKit } from "./context";
import { safeUrl } from "./safeUrl";

/**
 * A link from the payload, rendered by the provider's `linkComponent` when it has one. Without an
 * `href` (a payload missing its URL, or one `safeUrl` drops, like `javascript:`) it stays a plain
 * `<a>` with no destination, so the app's component always gets a safe one.
 */
export function Link({
  href: rawHref,
  children,
  ...props
}: Omit<LinkProps, "href"> & { href: string | undefined }) {
  const { linkComponent: Component } = useBlockKit();
  const href = safeUrl(rawHref);
  if (Component && href !== undefined)
    return (
      <Component href={href} {...props}>
        {children}
      </Component>
    );
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

/**
 * A resolved channel or user group mention: a link to the app's page for it when `mentionHref`
 * returns one, otherwise the plain pill. Both keep the pill's class, so they look the same.
 */
export function MentionLink({ type, id, children }: MentionRef & { children: ReactNode }) {
  const { mentionHref } = useBlockKit();
  const href = mentionHref?.({ type, id });
  return href === undefined ? (
    <span className="sbk-mention">{children}</span>
  ) : (
    <Link className="sbk-mention" href={href}>
      {children}
    </Link>
  );
}
