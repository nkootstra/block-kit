import type { ReactNode } from "react";

/** A stretch of a cell's text, as offsets into it: what a table filter marks. */
export interface TextMark {
  start: number;
  end: number;
}

/**
 * A piece of a cell's text that starts `from` characters into it, with the part `mark` covers
 * wrapped in Slack's highlight (`c-mrkdwn__highlight`).
 */
export function markText(text: string, from: number, mark: TextMark | undefined): ReactNode {
  const start = mark ? Math.max(mark.start - from, 0) : 0;
  const end = mark ? Math.min(mark.end - from, text.length) : 0;
  if (!mark || start >= end) return text;
  return (
    <>
      {text.slice(0, start)}
      <span className="sbk-data-table__match">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}
