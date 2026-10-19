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
import { useClientLayoutEffect } from "./useClientLayoutEffect";

/** How long the pointer rests on an anchor before its card shows, as for a tooltip. */
const SHOW_DELAY_MS = 300;
/** How long the card stays after the pointer leaves, so it can cross the gap into the card. */
const HIDE_DELAY_MS = 150;
/** Space between the anchor and the card (extra/fidelity/rich-text-channel/mixed@hover-mention-1). */
const GAP = 12;
/** The least space kept between the card and the window's edges. */
const EDGE = 8;

type AnchorProps = {
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
  "aria-describedby"?: string;
};

export interface HoverCardProps {
  /** The card's content; it describes the anchor (`aria-describedby`) while it shows. */
  content: ReactNode;
  /** A single element to anchor to; it receives the pointer handlers. */
  children: ReactElement<AnchorProps>;
  /** Extra class on the card. */
  className?: string;
}

/**
 * Slack's hover card (`elevation_3 sk_primary_background rounded-lg`): a card in the menu
 * background with the popover shadow, centred 12px above the element the pointer rests on, or
 * below it when there's no room above. Unlike a tooltip it follows only the pointer, stays open
 * while the pointer moves into it, and never takes focus. Portalled to `<body>` in the layer menus
 * open in (`sbk-popover`) so scroll containers and `overflow: hidden` can't clip it.
 */
export function HoverCard({ content, children, className }: HoverCardProps) {
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
    const left = Math.max(EDGE, Math.min(room, a.left + a.width / 2 - c.width / 2));
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
    "aria-describedby": open ? id : props["aria-describedby"],
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
