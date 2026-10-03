import { type ReactNode, useRef, useState } from "react";
import { useClientLayoutEffect } from "../useClientLayoutEffect";

/**
 * Slack's toggle-bar blocks (plan, task_card) slide open and shut: the block's height transitions
 * over 0.25s while its overflow is clipped. This does the same for the content under the toggle. It
 * keeps the content mounted until the closing transition ends, and skips the animation when the
 * stylesheet sets no transition (reduced motion, or no CSS loaded).
 */
export function Collapse({
  open,
  className,
  children,
}: {
  open: boolean;
  /** Sets a block's own timing, e.g. the container's shorter, eased slide. */
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Whether the content is mounted: it opens with `open` but only closes once the transition ends.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  // What `open` was last time, so only a toggle animates (not the first render).
  const was = useRef(open);

  useClientLayoutEffect(() => {
    // Set on the node, not as a prop: React 18 doesn't know `inert` and drops a boolean value.
    ref.current?.toggleAttribute("inert", !open);
    if (was.current === open) return;
    was.current = open;
    const el = ref.current;
    if (!el) return;
    if (!(parseFloat(getComputedStyle(el).transitionDuration) > 0)) {
      // No transition to wait for, and only the stylesheet can say so: unmount now.
      // eslint-disable-next-line react/set-state-in-effect
      if (!open) setShown(false);
      return;
    }
    // Start from the current height: 0 for fresh content, or wherever an interrupted transition is.
    const from = el.style.height ? el.offsetHeight : open ? 0 : el.offsetHeight;
    el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.height = open ? `${el.scrollHeight}px` : "0px";
  }, [open]);

  if (!shown) return null;
  return (
    <div
      ref={ref}
      className={className ? `sbk-collapse ${className}` : "sbk-collapse"}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget || e.propertyName !== "height") return;
        if (open) e.currentTarget.style.height = "";
        else setShown(false);
      }}
    >
      {children}
    </div>
  );
}
