import { useEffect, useRef, useState } from "react";
import { DataTableCell } from "../data/dataTableCells";
import type { TextMark } from "../data/textMark";
import { ExpandDiagonalIcon } from "../data/icons";
import { Popover } from "../elements/Popover";
import type { Json } from "../types";
import { useClientLayoutEffect } from "../useClientLayoutEffect";

/**
 * Height of a cell's content box. The expanded content opens over it, from its top edge: inside
 * the table's outline, as Slack lays it over the cell's inner wrapper.
 */
const CONTENT_HEIGHT = 48;

/**
 * A body cell of a data table. Its content shows on one line, cut off with an ellipsis; when it
 * doesn't fit, Slack adds an "Expand cell" button that shows on hover (here also on keyboard focus)
 * and opens the whole content in a "Cell content" dialog laid over the cell, as wide as it and
 * scrolling past 144px (catalog/table/basic-data-table@hover-cell-1, @expand-cell-1). Escape or a
 * press outside closes it.
 */
export function DataTableBodyCell({
  cell,
  rowHeader,
  mark,
}: {
  cell: Json;
  rowHeader: boolean;
  /** A table filter's match in the cell, highlighted. */
  mark?: TextMark;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  // The clamp hides the lines past the first, and a word too long for the cell breaks onto them.
  useClientLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const measure = () => setOverflows(text.scrollHeight > text.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [cell]);

  // Slack takes the button away while the content is open; Escape brings it back, focused.
  const refocus = useRef(false);
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    buttonRef.current?.focus();
  }, [open]);
  const close = (focusButton: boolean) => {
    refocus.current = focusButton;
    setOpen(false);
  };

  return (
    <div className="sbk-data-table__cell" role={rowHeader ? "rowheader" : "cell"}>
      <div ref={contentRef} className="sbk-data-table__cell-content">
        <span ref={textRef} className="sbk-data-table__truncate">
          <DataTableCell cell={cell} mark={mark} />
        </span>
      </div>
      {overflows && !open ? (
        <div className="sbk-data-table__expand-wrap">
          <button
            ref={buttonRef}
            type="button"
            className="sbk-data-table__expand"
            aria-label="Expand cell"
            aria-expanded={false}
            onClick={() => setOpen(true)}
          >
            <ExpandDiagonalIcon />
          </button>
        </div>
      ) : null}
      {open ? (
        <Popover
          anchorRef={contentRef}
          gap={-CONTENT_HEIGHT}
          onDismiss={() => close(false)}
          onPlaced={() => dialogRef.current?.focus()}
        >
          <div
            ref={dialogRef}
            className="sbk-data-table__cell-popover"
            role="dialog"
            aria-label="Cell content"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              close(true);
            }}
          >
            <DataTableCell cell={cell} />
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
