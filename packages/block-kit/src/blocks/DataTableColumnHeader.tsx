import { type ReactNode, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, MenuCheckIcon, SortCaretIcon } from "../data/icons";
import { Popover } from "../elements/Popover";
import { useMenuNavigation } from "../elements/useMenuNavigation";

export type SortDirection = "asc" | "desc";

const DIRECTIONS = [
  { direction: "asc", label: "Ascending", icon: <ArrowUpIcon /> },
  { direction: "desc", label: "Descending", icon: <ArrowDownIcon /> },
] as const;

/**
 * A sortable column header. As in Slack, pressing it opens a small "Sort" menu rather than sorting
 * straight away: Ascending and Descending, with the current one checked, and Clear Sort once this
 * column is the sorted one. The header itself shows no sort arrow; its caret only appears on hover.
 */
export function DataTableColumnHeader({
  label,
  sorted,
  onSort,
}: {
  label: ReactNode;
  /** This column's direction, or null when the table is unsorted or sorted by another column. */
  sorted: SortDirection | null;
  onSort: (direction: SortDirection | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const choices: (SortDirection | null)[] = sorted ? ["asc", "desc", null] : ["asc", "desc"];

  function choose(direction: SortDirection | null) {
    setOpen(false);
    onSort(direction);
  }

  const nav = useMenuNavigation({
    open,
    count: choices.length,
    onChoose: (i) => choose(choices[i] ?? null),
    onClose: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
    onOpen: () => setOpen(true),
    listRef,
  });

  return (
    <div
      role="columnheader"
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
      className="sbk-data-table__col-header"
      onKeyDown={nav.onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sbk-data-table__col-label">{label}</span>
        <span className="sbk-data-table__sort-caret">
          <SortCaretIcon />
        </span>
      </button>
      {open ? (
        <Popover anchorRef={triggerRef} gap={0} onDismiss={() => setOpen(false)}>
          <div className="sbk-data-table__sort-menu" role="menu" ref={listRef}>
            <div className="sbk-data-table__sort-heading" role="presentation">
              Sort
            </div>
            {DIRECTIONS.map(({ direction, label: itemLabel, icon }, i) => (
              <div
                key={direction}
                role="menuitemradio"
                aria-checked={sorted === direction}
                className="sbk-data-table__sort-item"
                onClick={() => choose(direction)}
                {...nav.itemProps(i)}
              >
                {sorted === direction ? (
                  <span className="sbk-data-table__sort-check">
                    <MenuCheckIcon />
                  </span>
                ) : null}
                <span className="sbk-data-table__sort-icon">{icon}</span>
                {itemLabel}
              </div>
            ))}
            {sorted ? (
              <>
                <div className="sbk-data-table__sort-separator" role="separator" />
                <div
                  role="menuitem"
                  className="sbk-data-table__sort-item sbk-data-table__sort-item--danger"
                  onClick={() => choose(null)}
                  {...nav.itemProps(2)}
                >
                  Clear Sort
                </div>
              </>
            ) : null}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
