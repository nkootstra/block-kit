import { dataTableCellText } from "../data/dataTableCells";
import type { TextMark } from "../data/textMark";
import type { Json } from "../types";

/** Whether a row has a cell whose text contains the term, ignoring case, as Slack's filter keeps. */
export function rowMatches(row: Json[], term: string): boolean {
  const needle = term.toLowerCase();
  return row.some((cell) => dataTableCellText(cell).toLowerCase().includes(needle));
}

/**
 * Where the term first occurs in a cell's text, ignoring case: the stretch Slack's filter marks
 * (`c-mrkdwn__highlight`). Undefined without a term or a match.
 */
export function cellMatch(cell: Json, term: string): TextMark | undefined {
  if (!term) return undefined;
  const start = dataTableCellText(cell).toLowerCase().indexOf(term.toLowerCase());
  return start < 0 ? undefined : { start, end: start + term.length };
}
