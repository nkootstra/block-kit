import type { ReactNode } from "react";
import { type LinkProps, type MentionRef, useBlockKit } from "./context";

/**
 * A link from the payload, rendered by the provider's `linkComponent` when it has one. Without an
 * `href` (a payload missing its URL) it stays a plain `<a>`, so the app's component always gets one.
 */
export function Link({
  href,
  children,
  ...props
}: Omit<LinkProps, "href"> & { href: string | undefined }) {
  const { linkComponent: Component } = useBlockKit();
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
