import {
  cloneElement,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** How long the pointer rests on an anchor before its tooltip shows. */
const SHOW_DELAY_MS = 300;

type Placement = "top" | "bottom";

type AnchorProps = {
  onMouseEnter?: (e: MouseEvent) => void;
  onMouseLeave?: (e: MouseEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  "aria-describedby"?: string;
};

export interface TooltipProps {
  /** Tooltip content; nothing is rendered when empty. */
  label: ReactNode;
  /** A single element to anchor to; it receives the hover/focus handlers. */
  children: ReactElement<AnchorProps>;
  /** Preferred side; flips to the other one when there's no room. Defaults to `top`. */
  placement?: Placement;
}

/**
 * Slack's `c-tooltip`: a dark, bold 13px bubble with an arrow, shown above (or below) its anchor
 * after a short hover or on keyboard focus. It appears and disappears without animation, as in
 * Slack. Portalled to `<body>` so scroll containers and `overflow: hidden` can't clip it.
 */
export function Tooltip({ label, children, placement = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    side: Placement;
  } | null>(null);
  const anchorRef = useRef<Element | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    const fitsAbove = a.top - gap - t.height >= 0;
    const fitsBelow = a.bottom + gap + t.height <= window.innerHeight;
    const side: Placement =
      placement === "top"
        ? fitsAbove || !fitsBelow
          ? "top"
          : "bottom"
        : fitsBelow || !fitsAbove
          ? "bottom"
          : "top";
    const left = Math.min(
      Math.max(4, a.left + a.width / 2 - t.width / 2),
      window.innerWidth - t.width - 4,
    );
    setPosition({ top: side === "top" ? a.top - gap - t.height : a.bottom + gap, left, side });
  }, [open, placement]);

  if (label === undefined || label === null || label === "") return children;

  function show(e: { currentTarget: Element }, immediate: boolean) {
    anchorRef.current = e.currentTarget;
    clearTimeout(timer.current);
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }

  function hide() {
    clearTimeout(timer.current);
    setOpen(false);
  }

  const props = children.props;
  const anchor = cloneElement(children, {
    onMouseEnter: (e: MouseEvent) => {
      props.onMouseEnter?.(e);
      show(e, false);
    },
    onMouseLeave: (e: MouseEvent) => {
      props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: FocusEvent) => {
      props.onFocus?.(e);
      if ((e.currentTarget as Element).matches?.(":focus-visible")) show(e, true);
    },
    onBlur: (e: FocusEvent) => {
      props.onBlur?.(e);
      hide();
    },
    "aria-describedby": open ? id : props["aria-describedby"],
  });

  const tip =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className={`sbk-tooltip sbk-tooltip--${position?.side ?? placement}`}
            style={
              position
                ? { top: position.top, left: position.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
          >
            {label}
            <span className="sbk-tooltip__arrow" aria-hidden="true" />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {anchor}
      {tip}
    </>
  );
}
