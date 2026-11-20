import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useBlockKitConfig } from "../context";
import { CloseIcon } from "../icons";

export interface ChartTableModalProps {
  title?: string;
  /** The chart's data as Slack tabulates it, header row first. */
  rows: string[][];
  onClose: () => void;
}

/**
 * What a chart's "View as table" opens in Slack: a modal (`c-sk-modal`) that fills the window but
 * for 28px on each side, up to 1280px wide, titled with the chart's title and holding the data as a
 * `table` block, without its hover actions, in a scroll container Tab reaches before the close
 * button. Escape, the close button and a click on the dimmed overlay close it. Slack leaves focus on the page when it closes; this returns it to whatever
 * opened it (the chart's "More actions" button), so keyboard users keep their place.
 */
export function ChartTableModal({ title, rows, onClose }: ChartTableModalProps) {
  const { theme } = useBlockKitConfig();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [header, ...body] = rows;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      // As in Slack, Tab goes from the table to the close button and back, and stays in the modal.
      event.preventDefault();
      const order = [scrollRef.current, closeRef.current];
      const at = order.indexOf(document.activeElement as HTMLDivElement | HTMLButtonElement);
      const next = event.shiftKey ? (at <= 0 ? 1 : at - 1) : at === 0 ? 1 : 0;
      order[next]?.focus();
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="sbk-root sbk-chart-table-layer"
      data-theme={theme}
      role="presentation"
      onClick={onClose}
    >
      {/* A modal dialog handles its own keys: Escape closes it and Tab stays inside it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        className="sbk-chart-table"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // Stop the overlay's onClick (close) from firing for clicks inside the dialog.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sbk-chart-table__header">
          <h1 id={titleId} className="sbk-chart-table__title">
            {title}
          </h1>
          <button
            ref={closeRef}
            type="button"
            className="sbk-chart-table__close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div className="sbk-chart-table__content">
          {/* Slack's table scrolls in a container the keyboard can reach, so a wide or long table
              can be scrolled without a pointer; it keeps the browser's own focus outline. */}
          <div
            ref={scrollRef}
            className="sbk-chart-table__scroll"
            role="region"
            aria-labelledby={titleId}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region
            tabIndex={0}
          >
            <table className="sbk-table__table sbk-chart-table__table">
              {header ? (
                <thead className="sbk-table__thead">
                  <tr>
                    {header.map((cell, i) => (
                      <th key={i} className="sbk-table__th">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody className="sbk-table__tbody">
                {body.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (
                      <td key={i} className="sbk-table__td">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
