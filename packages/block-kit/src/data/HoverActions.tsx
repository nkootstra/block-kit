import { Fragment, type ReactNode, type RefObject, useId, useRef, useState } from "react";
import { Popover } from "../elements/Popover";
import { useMenuNavigation } from "../elements/useMenuNavigation";
import {
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  ImageIcon,
  OpenInWindowIcon,
  TableIcon,
} from "../icons";
import { Tooltip } from "../Tooltip";

export interface HoverMenuItem {
  label: string;
  onSelect: () => void;
  /** Slack's 15px glyph before the label (a chart's items have one; an image's don't). */
  icon?: ReactNode;
  /** Shown greyed out: the arrow keys still reach it, but it isn't highlighted and does nothing. */
  disabled?: boolean;
  /** Draws Slack's `c-menu_separator` (a 1px line with 8px above and below) before the item. */
  separatorBefore?: boolean;
}

export interface HoverAction {
  /** Tooltip and accessible name, e.g. "Copy table". */
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  /** Renders the action as a link (e.g. "Open in new window"). */
  href?: string;
  /** Opens a `c-menu` of further actions (Slack's "More actions"). */
  menu?: HoverMenuItem[];
}

/** Where a "More actions" menu opens beside its button, top edges aligned, as Slack does. */
type MenuSide = "left" | "right";

/**
 * Slack's `c-message_actions__group` pinned to the top-right of a table, image or chart: a white
 * 12px-radius pill of 32px icon buttons that fades in while its host is hovered or focused.
 * The host needs the `sbk-hover-actions-host` class.
 */
export function HoverActions({
  actions,
  className,
  menuSide = "left",
}: {
  actions: HoverAction[];
  className?: string;
  menuSide?: MenuSide;
}) {
  return (
    <div className={`sbk-hover-actions${className ? ` ${className}` : ""}`} role="group">
      {actions.map((action) =>
        action.menu ? (
          <MenuAction key={action.label} action={action} items={action.menu} side={menuSide} />
        ) : (
          <Tooltip key={action.label} label={action.label}>
            {action.href ? (
              <a
                className="sbk-hover-actions__button"
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={action.label}
              >
                {action.icon}
              </a>
            ) : (
              <button
                type="button"
                className="sbk-hover-actions__button"
                aria-label={action.label}
                onClick={action.onClick}
              >
                {action.icon}
              </button>
            )}
          </Tooltip>
        ),
      )}
    </div>
  );
}

/** The menu's width and its distance from the button, measured in Block Kit Builder. */
const MENU_WIDTH = 300;
const MENU_SIDE_GAP = 4;
const BUTTON_SIZE = 32;

function MenuAction({
  action,
  items,
  side,
}: {
  action: HoverAction;
  items: HoverMenuItem[];
  side: MenuSide;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();

  function choose(i: number) {
    const item = items[i];
    if (!item || item.disabled) return;
    setOpen(false);
    // Slack hands focus back to the button; an action that moves it (Hide image) runs after.
    triggerRef.current?.focus();
    item.onSelect();
  }

  const nav = useMenuNavigation({
    open,
    count: items.length,
    onChoose: choose,
    onClose: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
    onOpen: () => setOpen(true),
    listRef,
  });

  return (
    <div className="sbk-hover-actions__menu-root" onKeyDown={nav.onKeyDown}>
      <Tooltip label={open ? "" : action.label}>
        <button
          ref={triggerRef}
          type="button"
          className="sbk-hover-actions__button"
          aria-label={action.label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {action.icon}
        </button>
      </Tooltip>
      {open && (
        // Slack opens it beside the button, top edges aligned: a chart's to the right, flush with
        // the button, an image's 4px to its left. It's portaled like the overflow menu, so the
        // card (which clips its content) neither cuts it off nor scrolls to show it.
        <Popover
          anchorRef={triggerRef}
          onDismiss={() => setOpen(false)}
          gap={-BUTTON_SIZE}
          offsetX={side === "right" ? BUTTON_SIZE : -(MENU_WIDTH + MENU_SIDE_GAP)}
          onPlaced={() => listRef.current?.focus()}
        >
          <div
            className="sbk-overflow__menu sbk-hover-actions__menu"
            role="menu"
            ref={listRef}
            tabIndex={-1}
            aria-activedescendant={nav.active >= 0 ? `${idPrefix}-${nav.active}` : undefined}
          >
            {items.map((item, i) => (
              <Fragment key={item.label}>
                {item.separatorBefore ? <hr className="sbk-hover-actions__separator" /> : null}
                <div
                  id={`${idPrefix}-${i}`}
                  role="menuitem"
                  aria-disabled={item.disabled || undefined}
                  className={
                    item.disabled
                      ? "sbk-overflow__option sbk-hover-actions__item sbk-hover-actions__item--disabled"
                      : "sbk-overflow__option sbk-hover-actions__item"
                  }
                  onClick={() => choose(i)}
                  {...nav.itemProps(i)}
                >
                  {item.icon ? <span className="sbk-hover-actions__icon">{item.icon}</span> : null}
                  <span className="sbk-hover-actions__label">{item.label}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Reads a rendered `<table>` into rows of cell text. */
export function tableRows(table: HTMLTableElement | null): string[][] {
  if (!table) return [];
  return Array.from(table.rows, (row) =>
    Array.from(row.cells, (cell) => (cell.textContent ?? "").trim()),
  );
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.join("\t")).join("\n");
}

export function copyText(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {});
}

/** Saves `text` as a file via a temporary object-URL link. */
export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Slack's table actions: "Download table" (CSV) and "Copy table" (tab-separated, pastes into
 * spreadsheets). Reads the rendered table so rich cells export as their visible text. */
export function TableActions({ tableRef }: { tableRef: RefObject<HTMLTableElement | null> }) {
  return (
    <HoverActions
      actions={[
        {
          label: "Download table",
          icon: <DownloadIcon />,
          onClick: () => downloadText("table.csv", toCsv(tableRows(tableRef.current))),
        },
        {
          label: "Copy table",
          icon: <CopyIcon />,
          onClick: () => copyText(toTsv(tableRows(tableRef.current))),
        },
      ]}
    />
  );
}

/**
 * Slack's `p-attachment_image_actions`: open the full image in a new window, plus a menu to copy
 * its link or hide it (as the caret beside its title does).
 */
export function ImageActions({ url, onHide }: { url: string; onHide: () => void }) {
  return (
    <HoverActions
      className="sbk-hover-actions--image"
      actions={[
        { label: "Open in new window", icon: <OpenInWindowIcon />, href: url },
        {
          label: "More actions",
          icon: <EllipsisVerticalIcon />,
          menu: [
            { label: "Copy link", onSelect: () => copyText(url) },
            { label: "Hide image", onSelect: onHide },
          ],
        },
      ]}
    />
  );
}

/**
 * Slack's file name for a chart's data: the title with its accents dropped, lowercased, and each
 * run of other characters than letters, digits and `_` turned into a hyphen.
 */
export function chartFileName(title: string | undefined): string {
  const slug = (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "chart"}.tsv`;
}

/**
 * A chart's "More actions" menu, as Slack lists it: "View as table" opens the data in a modal,
 * "Download chart data" saves it as a TSV, and "Copy as image" shows disabled, as in Block Kit
 * Builder. None of them reaches the app.
 */
export function ChartActions({
  rows,
  title,
  onViewTable,
}: {
  /** The chart's data as Slack tabulates it, header row first. */
  rows: string[][];
  title?: string;
  onViewTable: () => void;
}) {
  return (
    <HoverActions
      className="sbk-hover-actions--chart"
      menuSide="right"
      actions={[
        {
          label: "More actions",
          icon: <EllipsisVerticalIcon />,
          menu: [
            { label: "View as table", icon: <TableIcon />, onSelect: onViewTable },
            {
              label: "Download chart data",
              icon: <DownloadIcon width="15" height="15" />,
              onSelect: () =>
                downloadText(chartFileName(title), toTsv(rows), "text/tab-separated-values"),
            },
            {
              label: "Copy as image",
              icon: <ImageIcon />,
              separatorBefore: true,
              disabled: true,
              onSelect: () => {},
            },
          ],
        },
      ]}
    />
  );
}
