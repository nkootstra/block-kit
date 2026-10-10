import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "../context";
import { useClientLayoutEffect } from "../useClientLayoutEffect";

/** Space between the anchor and the popover, as in Slack's menus. */
const DEFAULT_GAP = 4;
/** The least space kept between a popover and the window's left and right edges. */
const EDGE = 8;

/** Slack's select menus, time list and calendar overlap their field's bottom 4px instead. */
export const MENU_GAP = -4;

export interface PopoverProps {
  /** The element the popover opens from; it's placed below it, or above when there's no room. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Called on a press outside both the anchor and the popover. */
  onDismiss: () => void;
  /** Space between the anchor and the popover; Slack's table sort menu sits flush below its header. */
  gap?: number;
  /** Horizontal shift from the anchor's left edge; Slack's select menus start 12px to its left. */
  offsetX?: number;
  /**
   * Called once the popover is placed and visible. It renders hidden until then, and a hidden
   * element can't take focus, so move focus into the popover here rather than when it mounts.
   */
  onPlaced?: () => void;
  children: ReactNode;
}

/**
 * The layer a menu or calendar opens in. Slack mounts its popovers at the top of the page, so a
 * message list, a modal body or a carousel never clips them; this portals to `<body>` the same way
 * and keeps the popover pinned to its anchor as the page scrolls or resizes, or its content does.
 * Where keeping its alignment would run it past the window's left or right edge (a narrow phone
 * screen), it shifts just enough to stay inside.
 * The layer is as wide as the anchor, so a child sized `width: 100%` matches the control it opened
 * from.
 */
export function Popover({
  anchorRef,
  onDismiss,
  gap = DEFAULT_GAP,
  offsetX = 0,
  onPlaced,
  children,
}: PopoverProps) {
  const { theme } = useBlockKit();
  const layerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  // The latest onDismiss, for the document listener below without re-adding it on every render.
  const dismiss = useRef(onDismiss);
  useClientLayoutEffect(() => {
    dismiss.current = onDismiss;
  });

  useClientLayoutEffect(() => {
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
      // Taller than the room on either side: keep it on screen rather than past the window's edge,
      // with the default gap to spare even for a popover that overlaps its anchor (`MENU_GAP`).
      if (!fitsBelow && !fitsAbove) {
        top = Math.max(DEFAULT_GAP, Math.min(below, window.innerHeight - height - DEFAULT_GAP));
      }
      // The content is positioned inside a layer as wide as the anchor (a calendar right-aligned to
      // it, a menu left-aligned), so size the layer first and measure where the content lands.
      layer.style.width = `${a.width}px`;
      const content = layer.firstElementChild?.getBoundingClientRect();
      const layerLeft = layer.getBoundingClientRect().left;
      let left = a.left + offsetX;
      if (content) {
        // Keep Slack's alignment while it fits; otherwise shift just enough to stay in the window,
        // the left edge winning when the content is wider than the window.
        const contentLeft = left + content.left - layerLeft;
        const room = document.documentElement.clientWidth - EDGE;
        const shift = Math.max(
          EDGE - contentLeft,
          Math.min(0, room - (contentLeft + content.width)),
        );
        left += shift;
        // Slack places its popovers on whole pixels; a calendar right-aligned to a field 194.5px
        // wide would otherwise start on a half pixel and blur its text.
        const placedLeft = left + content.left - layerLeft;
        left += Math.round(placedLeft) - placedLeft;
      }
      setPosition({ top: Math.round(top), left, width: a.width });
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
  }, [anchorRef, gap, offsetX]);

  // Once, on the first placement: later ones only follow the anchor as the page scrolls.
  const placed = position !== null;
  const notified = useRef(false);
  useEffect(() => {
    if (!placed || notified.current) return;
    notified.current = true;
    onPlaced?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

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
