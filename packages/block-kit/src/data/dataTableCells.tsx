import type { Json } from "../types";
import { RichTextMini, richTextMiniToString } from "./richTextMini";
import { Link } from "../Link";

/** Renders a `data_table` cell: `raw_text`, `raw_number`, `url`, or `rich_text`. */
export function DataTableCell({ cell }: { cell: Json }) {
  if (!cell || typeof cell !== "object") return null;
  switch (cell.type) {
    case "rich_text":
      return <RichTextMini value={cell} />;
    case "url":
      return (
        <Link
          className="sbk-rtmini__link"
          href={typeof cell.url === "string" ? cell.url : undefined}
          target="_blank"
          rel="noreferrer noopener"
        >
          {typeof cell.text === "string" ? cell.text : String(cell.url ?? "")}
        </Link>
      );
    case "raw_number":
      return <>{typeof cell.text === "string" ? cell.text : String(cell.value ?? "")}</>;
    default:
      return <>{typeof cell.text === "string" ? cell.text : ""}</>;
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
