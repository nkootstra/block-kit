import { type ReactNode, useEffect, useRef } from "react";
import type { StackedView } from "../context";
import { useClientLayoutEffect } from "../useClientLayoutEffect";

export interface ModalLayerProps {
  stack: StackedView[];
  renderEntry: (entry: StackedView) => ReactNode;
}

/**
 * The dimmed overlay that modals opened through `views` sit on. Every view in the stack stays
 * mounted (only the top one is shown) so going back after a push keeps the earlier view's input.
 *
 * Focus moves into the top view whenever it changes (unless a `focus_on_load` element already
 * took it), and goes back to whatever had it before the first modal opened once the stack closes.
 */
export function ModalLayer({ stack, renderEntry }: ModalLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const topId = stack.at(-1)?.view.id;

  // A layout effect, so it reads the opener before a `focus_on_load` element (an ordinary effect)
  // takes focus.
  useClientLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const top = layerRef.current?.querySelector<HTMLElement>(
      ":scope > .sbk-modal-layer__view:not([hidden]) [role='dialog']",
    );
    if (top && !top.contains(document.activeElement)) top.focus();
  }, [topId]);

  return (
    <div ref={layerRef} className="sbk-modal-layer">
      {stack.map((entry, i) => (
        <div key={entry.view.id} className="sbk-modal-layer__view" hidden={i !== stack.length - 1}>
          {renderEntry(entry)}
        </div>
      ))}
    </div>
  );
}
