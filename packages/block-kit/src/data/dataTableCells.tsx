import type { Json } from "../types";
import { RichTextMini, richTextMiniToString } from "./richTextMini";
import { Link } from "../Link";
import { markText, type TextMark } from "./textMark";

/**
 * Renders a `data_table` cell: `raw_text`, `raw_number`, `url`, or `rich_text`, with `mark` (a
 * filter's match) highlighted.
 */
export function DataTableCell({ cell, mark }: { cell: Json; mark?: TextMark }) {
  if (!cell || typeof cell !== "object") return null;
  switch (cell.type) {
    case "rich_text":
      return <RichTextMini value={cell} mark={mark} />;
    case "url":
      return (
        <Link
          className="sbk-rtmini__link"
          href={typeof cell.url === "string" ? cell.url : undefined}
          target="_blank"
          rel="noreferrer noopener"
        >
          {markText(typeof cell.text === "string" ? cell.text : String(cell.url ?? ""), 0, mark)}
        </Link>
      );
    case "raw_number":
      return (
        <>
          {markText(typeof cell.text === "string" ? cell.text : String(cell.value ?? ""), 0, mark)}
        </>
      );
    default:
      return <>{markText(typeof cell.text === "string" ? cell.text : "", 0, mark)}</>;
  }
}

/** The value a cell sorts by: a raw_number's numeric value, otherwise its plain text. */
export function dataTableSortValue(cell: Json | undefined): number | string {
  if (!cell || typeof cell !== "object") return "";
  if (cell.type === "raw_number" && typeof cell.value === "number") return cell.value;
  if (cell.type === "rich_text") return richTextMiniToString(cell).toLowerCase();
  if (typeof cell.text === "string") return cell.text.toLowerCase();
  return "";
}

/** A cell's text as it's shown, for copying or downloading the table. */
export function dataTableCellText(cell: Json | undefined): string {
  if (!cell || typeof cell !== "object") return "";
  switch (cell.type) {
    case "rich_text":
      return richTextMiniToString(cell);
    case "url":
      return typeof cell.text === "string" ? cell.text : String(cell.url ?? "");
    case "raw_number":
      return typeof cell.text === "string" ? cell.text : String(cell.value ?? "");
    default:
      return typeof cell.text === "string" ? cell.text : "";
  }
}
