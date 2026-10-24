import { Fragment, type ReactNode } from "react";
import { useBlockKit } from "../context";
import type { Json } from "../types";
import { markText, type TextMark } from "./textMark";
import { Link } from "../Link";
import { PrivateUser, UserMention } from "../UserMention";

/**
 * Minimal renderer for the `rich_text` objects embedded as table/plan/task_card cell values
 * (`{type:"rich_text", elements:[{type:"rich_text_section", elements:[...]}]}`): `text` and `link`
 * leaf elements with basic styling, and user mentions, drawn as the `rich_text` block draws them.
 * It stays self-contained rather than depending on the full `rich_text` block (owned separately).
 */
export function RichTextMini({ value, mark }: { value: Json; mark?: TextMark }) {
  if (!value || typeof value !== "object") return null;
  const elements = Array.isArray((value as Json).elements) ? (value as Json).elements : [];
  // Each leaf's offset into the text richTextMiniToString reads, so a mark lands on the right leaf.
  let offset = 0;
  return (
    <>
      {(elements as Json[]).map((section, i) => {
        const leaves = Array.isArray(section.elements) ? (section.elements as Json[]) : [];
        return (
          <Fragment key={i}>
            {leaves.map((el, j) => {
              const from = offset;
              offset += typeof el.text === "string" ? el.text.length : 0;
              return <RichTextMiniLeaf key={j} element={el} from={from} mark={mark} />;
            })}
          </Fragment>
        );
      })}
    </>
  );
}

function RichTextMiniLeaf({
  element,
  from = 0,
  mark,
}: {
  element: Json;
  from?: number;
  mark?: TextMark;
}) {
  if (element.type === "user") return <RichTextMiniUser id={String(element.user_id ?? "")} />;
  if (element.type === "link") {
    const text = typeof element.text === "string" ? element.text : String(element.url ?? "");
    return (
      <Link
        className="sbk-rtmini__link"
        href={typeof element.url === "string" ? element.url : undefined}
        target="_blank"
        rel="noreferrer noopener"
      >
        {typeof element.text === "string" ? markText(text, from, mark) : text}
      </Link>
    );
  }
  if (element.type !== "text") return null;
  const text = typeof element.text === "string" ? element.text : "";
  const style = (element.style ?? {}) as Json;
  let node: ReactNode = markText(text, from, mark);
  if (style.code) node = <code className="sbk-rtmini__code">{node}</code>;
  if (style.bold) node = <b>{node}</b>;
  if (style.italic) node = <i>{node}</i>;
  if (style.strike) node = <s>{node}</s>;
  return <>{node}</>;
}

/**
 * A user mention: the resolved name, or, like Slack's `c-missing_text` for a user it can't find,
 * the loading skeleton.
 */
function RichTextMiniUser({ id }: { id: string }) {
  const name = useBlockKit().resolvers.user?.(id);
  return name ? <UserMention id={id} name={name} /> : <PrivateUser id={id} />;
}

/** Plain-text extraction of a rich_text value, used for sorting table cells. */
export function richTextMiniToString(value: Json): string {
  if (!value || typeof value !== "object") return "";
  const elements = Array.isArray((value as Json).elements) ? (value as Json).elements : [];
  return (elements as Json[])
    .map((section) => {
      const leaves = Array.isArray(section.elements) ? (section.elements as Json[]) : [];
      return leaves.map((leaf) => (typeof leaf.text === "string" ? leaf.text : "")).join("");
    })
    .join("");
}
