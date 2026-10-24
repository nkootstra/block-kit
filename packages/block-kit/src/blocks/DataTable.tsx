import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DataTableCell, dataTableCellText, dataTableSortValue } from "../data/dataTableCells";
import { copyText, downloadText, MenuAction, toCsv, toTsv } from "../data/HoverActions";
import { ChevronIcon, ExpandIcon, KebabIcon, SearchIcon } from "../data/icons";
import { CopyIcon, DownloadIcon } from "../icons";
import type { BlockProps, Json } from "../types";
import { DataTableBodyCell } from "./DataTableBodyCell";
import { DataTableColumnHeader, type SortDirection } from "./DataTableColumnHeader";
import { cellMatch, rowMatches } from "./dataTableFilter";

interface DataTableBlock extends Json {
  type: "data_table";
  caption?: string;
  rows: Json[][];
}

const PAGE_SIZE = 5;
/** Height of a body row, which Slack uses to pad a short last page up to a full one. */
const ROW_HEIGHT = 48;
/** The least a column narrows to; past that the frame scrolls sideways. */
const MIN_COLUMN_WIDTH = 120;
/** Height of the column header row, which an empty filter result takes the place of. */
const HEADER_HEIGHT = 36;

/**
 * The `data_table` block: a caption, a sortable/paginated grid of cells (first row is the
 * header), and a small toolbar. Each column header opens a Sort menu (ascending, descending, or back to insertion order),
 * a cell cut off at its edge can be expanded to show its whole content, and Search filters the
 * rows to those with a cell that contains a term;
 * pagination kicks in above `PAGE_SIZE` data rows, matching Slack's Builder.
 */
export function DataTable({ block }: BlockProps<DataTableBlock>) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const [header, ...body] = rows;
  const columnCount = header?.length ?? 0;

  const [sort, setSort] = useState<{ column: number; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(0);
  // Slack's Search button turns into a filter box: rows stay while a cell of theirs contains the
  // term, ignoring case.
  const [filtering, setFiltering] = useState(false);
  const [term, setTerm] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
  const backToSearch = useRef(false);
  const emptyId = useId();

  const filteredBody = useMemo(
    () => (term ? body.filter((row) => Array.isArray(row) && rowMatches(row, term)) : body),
    [body, term],
  );

  const sortedBody = useMemo(() => {
    if (!sort) return filteredBody;
    const { column, direction } = sort;
    const withIndex = filteredBody.map((row, i) => ({ row, i }));
    withIndex.sort((a, b) => {
      const va = dataTableSortValue(a.row[column]);
      const vb = dataTableSortValue(b.row[column]);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      if (cmp === 0) cmp = a.i - b.i;
      return direction === "asc" ? cmp : -cmp;
    });
    return withIndex.map((entry) => entry.row);
  }, [filteredBody, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedBody.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows =
    sortedBody.length > PAGE_SIZE
      ? sortedBody.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
      : sortedBody;

  const sortColumn = (column: number, direction: SortDirection | null) => {
    setPage(0);
    setSort(direction ? { column, direction } : null);
  };

  const filter = (value: string) => {
    setPage(0);
    setTerm(value);
  };
  const closeFilter = (focusSearch: boolean) => {
    filter("");
    setFiltering(false);
    backToSearch.current = focusSearch;
  };
  useEffect(() => {
    if (filtering) filterRef.current?.focus();
    else if (backToSearch.current) {
      backToSearch.current = false;
      searchRef.current?.focus();
    }
  }, [filtering]);

  // A filtered table keeps the height of its first page, as Slack's does: the frame's grey shows
  // below the rows that are left, and the empty state fills the whole of it.
  const pageRows = Math.min(PAGE_SIZE, body.length);
  const noResults = term !== "" && sortedBody.length === 0;

  // Slack's "More actions" menu: the whole table, header first and in the payload's order, copied
  // tab-separated (it pastes into spreadsheets) or downloaded as CSV, as the table block's actions.
  const textRows = () => rows.map((row) => (Array.isArray(row) ? row.map(dataTableCellText) : []));
  const menuItems = [
    {
      label: "Copy table",
      icon: <CopyIcon width="16" height="16" />,
      onSelect: () => copyText(toTsv(textRows())),
    },
    {
      label: "Download table",
      icon: <DownloadIcon width="16" height="16" />,
      onSelect: () => downloadText("table.csv", toCsv(textRows())),
    },
  ];

  // Slack's columns share the width but never shrink below 120px; past that the frame scrolls.
  const gridStyle = {
    gridTemplateColumns: `repeat(${columnCount}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`,
  };

  return (
    <div className="sbk-data-table">
      <div className="sbk-data-table__header">
        {block.caption ? <span className="sbk-data-table__caption">{block.caption}</span> : null}
        {filtering ? (
          <div className="sbk-data-table__filter-wrap">
            <div className="sbk-data-table__filter">
              <SearchIcon />
              <input
                ref={filterRef}
                className="sbk-data-table__filter-input"
                type="text"
                role="searchbox"
                aria-label="Filter table…"
                placeholder="Filter table…"
                value={term}
                onChange={(e) => filter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  e.stopPropagation();
                  closeFilter(true);
                }}
                onBlur={(e) => {
                  const wrap = e.currentTarget.closest(".sbk-data-table__filter-wrap");
                  if (term === "" && !wrap?.contains(e.relatedTarget)) setFiltering(false);
                }}
              />
            </div>
            {term ? (
              <button
                type="button"
                className="sbk-data-table__filter-clear"
                aria-label="Clear text"
                onClick={() => {
                  filter("");
                  filterRef.current?.focus();
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="sbk-data-table__toolbar">
          {filtering ? null : (
            <button
              ref={searchRef}
              type="button"
              className="sbk-data-table__icon-btn"
              aria-label="Search table"
              onClick={() => setFiltering(true)}
            >
              <SearchIcon />
            </button>
          )}
          <button
            type="button"
            className="sbk-data-table__icon-btn"
            aria-label={block.caption ? `View ${block.caption}` : "View table"}
          >
            <ExpandIcon />
          </button>
          <MenuAction
            action={{ label: "More actions", icon: <KebabIcon /> }}
            items={menuItems}
            side="below"
            buttonClassName="sbk-data-table__icon-btn"
            tooltip={false}
          />
        </div>
      </div>

      <div className="sbk-data-table__frame">
        <div className="sbk-data-table__rows" role="table" aria-label={block.caption}>
          {noResults ? null : (
            <div className="sbk-data-table__grid-header" role="row" style={gridStyle}>
              {header?.map((cell, i) => (
                <DataTableColumnHeader
                  key={i}
                  label={<DataTableCell cell={cell} />}
                  sorted={sort?.column === i ? sort.direction : null}
                  onSort={(direction) => sortColumn(i, direction)}
                />
              ))}
            </div>
          )}
          <div className="sbk-data-table__body" role="rowgroup">
            {noResults ? (
              <div
                className="sbk-data-table__empty"
                role="row"
                style={{
                  height: HEADER_HEIGHT + pageRows * ROW_HEIGHT,
                  minWidth: columnCount * MIN_COLUMN_WIDTH,
                }}
              >
                <div className="sbk-data-table__empty-state" role="cell">
                  <span id={emptyId}>No results found.</span>
                  <button
                    type="button"
                    className="sbk-data-table__clear-filter"
                    aria-describedby={emptyId}
                    onClick={() => {
                      filter("");
                      filterRef.current?.focus();
                    }}
                  >
                    Clear filter
                  </button>
                </div>
              </div>
            ) : null}
            {visibleRows.map((row, r) => (
              <div key={r} className="sbk-data-table__row" role="row" style={gridStyle}>
                {row.map((cell, i) => (
                  <DataTableBodyCell
                    key={i}
                    cell={cell}
                    rowHeader={i === 0}
                    mark={cellMatch(cell, term)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {!noResults && visibleRows.length < pageRows ? (
          <div
            className="sbk-data-table__spacer"
            style={{ height: (pageRows - visibleRows.length) * ROW_HEIGHT }}
          />
        ) : null}
        {sortedBody.length > PAGE_SIZE ? (
          <div className="sbk-data-table__pagination" aria-label="Pagination">
            <button
              type="button"
              className="sbk-data-table__page-nav"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronIcon direction="left" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`sbk-data-table__page-btn${i === currentPage ? " sbk-data-table__page-btn--active" : ""}`}
                aria-label={String(i + 1)}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              className="sbk-data-table__page-nav"
              aria-label="Next page"
              disabled={currentPage === totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
