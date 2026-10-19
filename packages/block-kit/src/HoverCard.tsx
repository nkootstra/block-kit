import {
  cloneElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "./context";
import { copyText } from "./data/HoverActions";
import { CopyIcon, LinkIcon, NewWindowIcon } from "./icons";
import { safeUrl } from "./safeUrl";
import { Tooltip } from "./Tooltip";
import { useClientLayoutEffect } from "./useClientLayoutEffect";

/** How long the pointer rests on an anchor before its card shows, as for a tooltip. */
const SHOW_DELAY_MS = 300;
/** How long the card stays after the pointer leaves, so it can cross the gap into the card. */
const HIDE_DELAY_MS = 150;
/**
 * Space between the anchor and the card (extra/fidelity/rich-text-channel/mixed@hover-mention-1,
 * message/mrkdwn@hover-link-1).
 */
const GAP = 12;
/** The least space kept between the card and the window's edges. */
const EDGE = 8;

type AnchorProps = {
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
  "aria-describedby"?: string;
};

export interface HoverCardProps {
  /** The card's content. */
  content: ReactNode;
  /** A single element to anchor to; it receives the pointer handlers. */
  children: ReactElement<AnchorProps>;
  /** Extra class on the card. */
  className?: string;
  /**
   * Whether the card describes its anchor (`aria-describedby`) while it shows. True by default,
   * for a card that is only text; false for one with controls of its own, like the link card.
   */
  describes?: boolean;
}

/**
 * Slack's hover card (`elevation_3 sk_primary_background rounded-lg`): a card in the menu
 * background with the popover shadow, centred 12px above the element the pointer rests on, or
 * below it when there's no room above. Unlike a tooltip it follows only the pointer, stays open
 * while the pointer moves into it, and never takes focus. Portalled to `<body>` in the layer menus
 * open in (`sbk-popover`) so scroll containers and `overflow: hidden` can't clip it.
 */
export function HoverCard({ content, children, className, describes = true }: HoverCardProps) {
  const { theme } = useBlockKit();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<Element | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useClientLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current;
    const card = cardRef.current;
    if (!anchor || !card) return;
    const a = anchor.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const above = a.top - GAP - c.height;
    const top =
      above >= 0 || a.bottom + GAP + c.height > window.innerHeight ? above : a.bottom + GAP;
    const room = document.documentElement.clientWidth - EDGE - c.width;
    // Slack centres the card on the anchor's left edge and half width, each rounded to a whole
    // pixel, so a link at x=119.375 and 82.27px wide gets a card at 20, not 20.5
    // (catalog/card-and-carousel/card-image-and-text@hover-link-1+dark, message/mrkdwn@hover-link-1).
    const centre = Math.round(a.left) + Math.round(a.width / 2);
    const left = Math.max(EDGE, Math.min(room, centre - c.width / 2));
    // Slack places its cards on whole pixels.
    setPosition({ top: Math.round(top), left: Math.round(left) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function show(anchor?: Element) {
    if (anchor) anchorRef.current = anchor;
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }

  function hide() {
    clearTimeout(timer.current);
    if (open) timer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }

  const props = children.props;
  const anchor = cloneElement(children, {
    onMouseEnter: (e: MouseEvent) => {
      props.onMouseEnter?.(e);
      show(e.currentTarget);
    },
    onMouseLeave: (e: MouseEvent) => {
      props.onMouseLeave?.(e);
      hide();
    },
    "aria-describedby": open && describes ? id : props["aria-describedby"],
  });

  const card =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="sbk-root sbk-popover"
            data-theme={theme}
            style={position ?? { top: 0, left: 0, visibility: "hidden" }}
          >
            <div
              ref={cardRef}
              id={id}
              className={`sbk-hover-card${className ? ` ${className}` : ""}`}
              onMouseEnter={() => show()}
              onMouseLeave={hide}
            >
              {content}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {anchor}
      {card}
    </>
  );
}

/**
 * A link in mrkdwn or rich text, in Slack's link hover card: resting the pointer on it shows the
 * URL card (message/mrkdwn@hover-link-1). A URL `safeUrl` drops gets no card. The link sits in a
 * span that takes the pointer handlers, so an app's `linkComponent` doesn't have to forward them.
 */
export function LinkHoverCard({ url, children }: { url: string | undefined; children: ReactNode }) {
  const href = safeUrl(url);
  if (url === undefined || href === undefined) return children;
  return (
    <HoverCard content={<LinkCard url={url.trim()} href={href} />} describes={false}>
      <span className="sbk-link-hover">{children}</span>
    </HoverCard>
  );
}

/**
 * Slack's link hover card (`urlHoverCardContainer`): a bold "Link" heading beside buttons to open
 * the URL in a new tab or copy it, over the URL as the payload wrote it.
 */
function LinkCard({ url, href }: { url: string; href: string }) {
  return (
    <div className="sbk-link-card">
      <div className="sbk-link-card__header">
        <div className="sbk-link-card__label">
          <LinkIcon />
          Link
        </div>
        <div className="sbk-link-card__actions" role="group" aria-label="Link actions">
          <Tooltip label="Open in new tab">
            <button
              type="button"
              className="sbk-icon-button sbk-link-card__action"
              aria-label="Open in new tab"
              onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
            >
              <NewWindowIcon />
            </button>
          </Tooltip>
          <Tooltip label="Copy link">
            <button
              type="button"
              className="sbk-icon-button sbk-link-card__action"
              aria-label="Copy link"
              onClick={() => copyText(url)}
            >
              <CopyIcon width={16} height={16} />
            </button>
          </Tooltip>
        </div>
      </div>
      <span className="sbk-link-card__url">{url}</span>
    </div>
  );
}
