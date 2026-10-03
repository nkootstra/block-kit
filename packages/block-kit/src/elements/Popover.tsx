import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "../context";

/** Space between the anchor and the popover, as in Slack's menus. */
const DEFAULT_GAP = 4;

export interface PopoverProps {
  /** The element the popover opens from; it's placed below it, or above when there's no room. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Called on a press outside both the anchor and the popover. */
  onDismiss: () => void;
  /** Space between the anchor and the popover; Slack's table sort menu sits flush below its header. */
  gap?: number;
  children: ReactNode;
}

/**
 * The layer a menu or calendar opens in. Slack mounts its popovers at the top of the page, so a
 * message list, a modal body or a carousel never clips them; this portals to `<body>` the same way
 * and keeps the popover pinned to its anchor as the page scrolls or resizes, or its content does.
 * The layer is as wide as the anchor, so a child sized `width: 100%` matches the control it opened
 * from.
 */
export function Popover({ anchorRef, onDismiss, gap = DEFAULT_GAP, children }: PopoverProps) {
  const { theme } = useBlockKit();
  const layerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  // The latest onDismiss, for the document listener below without re-adding it on every render.
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  });

  useLayoutEffect(() => {
    function place() {
      const anchor = anchorRef.current;
      const layer = layerRef.current;
      if (!anchor || !layer) return;
      const a = anchor.getBoundingClientRect();
      const height = (layer.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
      const below = a.bottom + gap;
      const above = a.top - gap - height;
      const fitsBelow = below + height <= window.innerHeight;
      const fitsAbove = above >= 0;
      let top = !fitsBelow && fitsAbove ? above : below;
      // Taller than the room on either side: keep it on screen rather than past the window's edge.
      if (!fitsBelow && !fitsAbove) {
        top = Math.max(gap, Math.min(below, window.innerHeight - height - gap));
      }
      setPosition({ top, left: a.left, width: a.width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    // Its content can change size while open (a select filtering its options), which moves a popover
    // placed above its anchor.
    const content = layerRef.current?.firstElementChild;
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (content) resize?.observe(content);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      resize?.disconnect();
    };
  }, [anchorRef, gap]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || layerRef.current?.contains(target)) return;
      dismiss.current();
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [anchorRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={layerRef}
      className="sbk-root sbk-popover"
      data-theme={theme}
      style={position ?? { top: 0, left: 0, visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
