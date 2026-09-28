import { useMemo, useState } from "react";
import { DataTableCell, dataTableSortValue } from "../data/dataTableCells";
import { ChevronIcon, ExpandIcon, KebabIcon, SearchIcon, SortNeutralIcon } from "../data/icons";
import type { BlockProps, Json } from "../types";

interface DataTableBlock extends Json {
  type: "data_table";
  caption?: string;
  rows: Json[][];
}

const PAGE_SIZE = 5;
type SortDirection = "asc" | "desc";

/**
 * The `data_table` block: a caption, a sortable/paginated grid of cells (first row is the
 * header), and a small toolbar. Sorting cycles asc -> desc -> insertion order per column;
 * pagination kicks in above `PAGE_SIZE` data rows, matching Slack's Builder.
 */
export function DataTable({ block }: BlockProps<DataTableBlock>) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const [header, ...body] = rows;
  const columnCount = header?.length ?? 0;

  const [sort, setSort] = useState<{ column: number; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(0);

  const sortedBody = useMemo(() => {
    if (!sort) return body;
    const { column, direction } = sort;
    const withIndex = body.map((row, i) => ({ row, i }));
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
  }, [body, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedBody.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows =
    sortedBody.length > PAGE_SIZE
      ? sortedBody.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
      : sortedBody;

  const toggleSort = (column: number) => {
    setPage(0);
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const gridStyle = { gridTemplateColumns: `repeat(${columnCount}, 1fr)` };

  return (
    <div className="sbk-data-table">
      <div className="sbk-data-table__header">
        {block.caption ? <span className="sbk-data-table__caption">{block.caption}</span> : null}
        <div className="sbk-data-table__toolbar">
          <button type="button" className="sbk-data-table__icon-btn" aria-label="Search table">
            <SearchIcon />
          </button>
          <button
            type="button"
            className="sbk-data-table__icon-btn"
            aria-label={block.caption ? `View ${block.caption}` : "View table"}
          >
            <ExpandIcon />
          </button>
          <button type="button" className="sbk-data-table__icon-btn" aria-label="More actions">
            <KebabIcon />
          </button>
        </div>
      </div>

      <div className="sbk-data-table__frame">
        <div className="sbk-data-table__rows">
          <div className="sbk-data-table__grid-header" style={gridStyle}>
            {header?.map((cell, i) => (
              <div key={i} className="sbk-data-table__col-header">
                <button type="button" onClick={() => toggleSort(i)}>
                  <span className="sbk-data-table__col-label">
                    <DataTableCell cell={cell} />
                  </span>
                  {sort?.column === i ? (
                    <ChevronIcon direction={sort.direction === "asc" ? "up" : "down"} />
                  ) : (
                    <span className="sbk-data-table__sort-caret">
                      <SortNeutralIcon />
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="sbk-data-table__body">
            {visibleRows.map((row, r) => (
              <div key={r} className="sbk-data-table__row" style={gridStyle}>
                {row.map((cell, i) => (
                  <div key={i} className="sbk-data-table__cell">
                    <div className="sbk-data-table__cell-content">
                      <span className="sbk-data-table__truncate">
                        <DataTableCell cell={cell} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

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
