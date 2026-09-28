import type { ReactNode } from "react";
import type { StackedView } from "../context";

export interface ModalLayerProps {
  stack: StackedView[];
  renderEntry: (entry: StackedView) => ReactNode;
}

/**
 * The dimmed overlay that modals opened through `views` sit on. Every view in the stack stays
 * mounted (only the top one is shown) so going back after a push keeps the earlier view's input.
 */
export function ModalLayer({ stack, renderEntry }: ModalLayerProps) {
  return (
    <div className="sbk-modal-layer">
      {stack.map((entry, i) => (
        <div key={entry.view.id} className="sbk-modal-layer__view" hidden={i !== stack.length - 1}>
          {renderEntry(entry)}
        </div>
      ))}
    </div>
  );
}
