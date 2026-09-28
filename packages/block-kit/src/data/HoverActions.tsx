import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useMenuNavigation } from "../elements/useMenuNavigation";
import { CopyIcon, DownloadIcon, EllipsisVerticalIcon, OpenInWindowIcon } from "../icons";
import { Tooltip } from "../Tooltip";

export interface HoverMenuItem {
  label: string;
  onSelect: () => void;
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

/**
 * Slack's `c-message_actions__group` pinned to the top-right of a table, image or chart: a white
 * 12px-radius pill of 32px icon buttons that fades in while its host is hovered or focused.
 * The host needs the `sbk-hover-actions-host` class.
 */
export function HoverActions({
  actions,
  className,
}: {
  actions: HoverAction[];
  className?: string;
}) {
  return (
    <div className={`sbk-hover-actions${className ? ` ${className}` : ""}`} role="group">
      {actions.map((action) =>
        action.menu ? (
          <MenuAction key={action.label} action={action} items={action.menu} />
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

function MenuAction({ action, items }: { action: HoverAction; items: HoverMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function choose(i: number) {
    setOpen(false);
    items[i]?.onSelect();
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
    <div className="sbk-hover-actions__menu-root" ref={rootRef} onKeyDown={nav.onKeyDown}>
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
        <div className="sbk-overflow__menu sbk-hover-actions__menu" role="menu" ref={listRef}>
          {items.map((item, i) => (
            <div
              key={item.label}
              role="menuitem"
              className="sbk-overflow__option"
              onClick={() => choose(i)}
              {...nav.itemProps(i)}
            >
              {item.label}
            </div>
          ))}
        </div>
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

/** Slack's `p-attachment_image_actions`: open the full image in a new window, plus a menu. */
export function ImageActions({ url }: { url: string }) {
  return (
    <HoverActions
      className="sbk-hover-actions--image"
      actions={[
        { label: "Open in new window", icon: <OpenInWindowIcon />, href: url },
        {
          label: "More actions",
          icon: <EllipsisVerticalIcon />,
          menu: [
            { label: "Copy link to image", onSelect: () => copyText(url) },
            {
              label: "Download image",
              onSelect: () => {
                const link = document.createElement("a");
                link.href = url;
                link.download = "";
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.click();
              },
            },
          ],
        },
      ]}
    />
  );
}

/** A chart's single "More actions" menu, exporting its underlying data. */
export function ChartActions({ rows, title }: { rows: string[][]; title?: string }) {
  const name = `${(title || "chart").replace(/[^\w-]+/g, "_")}.csv`;
  return (
    <HoverActions
      className="sbk-hover-actions--chart"
      actions={[
        {
          label: "More actions",
          icon: <EllipsisVerticalIcon />,
          menu: [
            { label: "Copy data", onSelect: () => copyText(toTsv(rows)) },
            { label: "Download as CSV", onSelect: () => downloadText(name, toCsv(rows)) },
          ],
        },
      ]}
    />
  );
}
