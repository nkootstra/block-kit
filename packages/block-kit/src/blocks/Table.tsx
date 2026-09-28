import { type CSSProperties, useRef } from "react";
import { TableActions } from "../data/HoverActions";
import { RichTextMini } from "../data/richTextMini";
import type { BlockProps, Json } from "../types";

interface ColumnSetting {
  is_wrapped?: boolean;
  align?: "left" | "center" | "right";
}

export interface TableBlock extends Json {
  type: "table";
  rows: Json[][];
  column_settings?: ColumnSetting[];
}

/** Renders one cell's content: a `rich_text` object, or a plain-text `raw_text`/legacy string cell. */
function Cell({ cell }: { cell: Json }) {
  if (cell && typeof cell === "object" && cell.type === "rich_text") {
    return <RichTextMini value={cell} />;
  }
  if (cell && typeof cell === "object" && typeof cell.text === "string") {
    return <>{cell.text}</>;
  }
  return null;
}

/**
 * The `table` block: a fixed grid of `rich_text`/`raw_text` cells, first row as the header.
 * `column_settings[i]` controls per-column alignment and text wrapping.
 */
export function Table({ block }: BlockProps<TableBlock>) {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const [header, ...body] = rows;
  const settings = block.column_settings ?? [];
  const tableRef = useRef<HTMLTableElement>(null);

  const cellStyle = (colIndex: number): CSSProperties | undefined => {
    const setting = settings[colIndex];
    if (!setting) return undefined;
    return {
      textAlign: setting.align,
      whiteSpace: setting.is_wrapped ? "normal" : "nowrap",
    };
  };

  return (
    <div className="sbk-table sbk-hover-actions-host sbk-hover-actions-host--fit">
      <div className="sbk-table__scroll">
        <table className="sbk-table__table" ref={tableRef}>
          {header ? (
            <thead className="sbk-table__thead">
              <tr>
                {header.map((cell, i) => (
                  <th key={i} className="sbk-table__th" style={cellStyle(i)}>
                    <Cell cell={cell} />
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody className="sbk-table__tbody">
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className="sbk-table__td" style={cellStyle(i)}>
                    <Cell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions tableRef={tableRef} />
    </div>
  );
}
