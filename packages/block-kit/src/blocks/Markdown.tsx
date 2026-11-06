import type { MarkdownBlock } from "@slack/types";
import { parsePlainTextEmoji } from "../parser";
import type {
  Blockquote,
  Code,
  Heading,
  InlineCode,
  Link,
  List,
  Nodes,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
  TableCell,
  TableRow,
  Text,
} from "mdast";
import { Fragment, type ReactNode, useRef } from "react";
import { TableActions } from "../data/HoverActions";
import { Emoji } from "../emoji";
// mdast has its own `Link` type.
import { Link as TextLink } from "../Link";
import type { BlockProps } from "../types";
import { asString } from "../payloadValues";
import { CodeBlock } from "./CodeBlock";
import { parseMarkdown } from "./markdownParse";

/**
 * Renders the (Builder-only) `markdown` block: a GitHub-flavored-markdown string that the Builder
 * converts into a run of the same building blocks used elsewhere (headers, dividers, rich-text-like
 * paragraphs, code snippets, tables). We parse with `mdast-util-from-markdown` + GFM and reuse those
 * blocks' own CSS classes so the two stay visually identical.
 */
export function Markdown({ block }: BlockProps<MarkdownBlock>) {
  const tree = parseMarkdown(asString(block.text) ?? "");
  return <div className="sbk-markdown">{renderBlocks(tree.children)}</div>;
}

const HEADING_TAGS = { 1: "h1", 2: "h2", 3: "h3" } as const;

function renderBlocks(children: RootContent[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < children.length) {
    const node = children[i];
    if (!node) {
      i++;
      continue;
    }

    if (node.type === "paragraph") {
      const run: Paragraph[] = [];
      while (i < children.length && children[i]?.type === "paragraph") {
        run.push(children[i] as Paragraph);
        i++;
      }
      nodes.push(
        <div key={key++} className="sbk-markdown__section">
          {run.map((p, j) => (
            <Fragment key={j}>
              {renderInline(p.children)}
              <span className="sbk-rich-text__br" />
            </Fragment>
          ))}
        </div>,
      );
      continue;
    }

    switch (node.type) {
      case "heading": {
        const heading = node as Heading;
        const depth = Math.min(heading.depth, 4);
        const Tag = HEADING_TAGS[depth as 1 | 2 | 3] ?? "h4";
        const level = depth >= 3 ? 3 : depth;
        nodes.push(
          <Tag key={key++} className={`sbk-header sbk-header--level-${level}`}>
            {renderInline(heading.children)}
          </Tag>,
        );
        break;
      }
      case "thematicBreak":
        nodes.push(<hr key={key++} className="sbk-divider" />);
        break;
      case "code": {
        const code = node as Code;
        if (code.lang) {
          nodes.push(<CodeBlock key={key++} language={code.lang} code={code.value} />);
        } else {
          nodes.push(
            <pre key={key++} className="sbk-rich-text__pre">
              {code.value}
            </pre>,
          );
        }
        break;
      }
      case "blockquote":
        nodes.push(
          <blockquote key={key++} className="sbk-rich-text__quote">
            {renderQuoteChildren((node as Blockquote).children)}
          </blockquote>,
        );
        break;
      case "list":
        nodes.push(renderList(node as List, key++, 0));
        break;
      case "table":
        nodes.push(renderTable(node as Table, key++));
        break;
      default:
        break;
    }
    // Slack separates a list, quote or code snippet from whatever follows it with the same 8px
    // paragraph break a paragraph ends with (extra/fidelity/markdown/mixed); the last node gets none
    // (catalog/markdown/inline-styles, catalog/markdown/code).
    if (SPACED_NODES.has(node.type) && i < children.length - 1) {
      nodes.push(
        <div key={key++} className="sbk-markdown__section">
          <span className="sbk-rich-text__br" />
        </div>,
      );
    }
    i++;
  }

  return nodes;
}

const SPACED_NODES = new Set<RootContent["type"]>(["list", "blockquote", "code"]);

/** Consecutive paragraphs inside a blockquote are joined with a plain line break, no spacer. */
function renderQuoteChildren(children: RootContent[]): ReactNode {
  const paragraphs = children.filter((c): c is Paragraph => c.type === "paragraph");
  return paragraphs.map((p, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(p.children)}
    </Fragment>
  ));
}

/**
 * How deep lists and inline styles nest before the rest renders as plain text. A payload can nest
 * them thousands deep (`"- ".repeat(1000)`), which would overflow the stack while rendering.
 */
const MAX_DEPTH = 32;

/** The text under `node`, read without recursion so any depth is safe. */
function plainText(node: Nodes): string {
  let text = "";
  const stack: Nodes[] = [node];
  for (let next = stack.pop(); next; next = stack.pop()) {
    if ("value" in next && typeof next.value === "string") text += next.value;
    else if ("children" in next)
      for (let i = next.children.length - 1; i >= 0; i--) stack.push(next.children[i] as Nodes);
  }
  return text;
}

/** Bullets are Slack's icon glyphs, drawn in CSS from the list's `data-indent` (RichText.css). */
function renderList(list: List, key: number, depth: number): ReactNode {
  if (depth >= MAX_DEPTH) return <Fragment key={key}>{plainText(list)}</Fragment>;
  const Tag = list.ordered ? "ol" : "ul";
  const style = list.ordered ? "ordered" : "bullet";
  const start = list.ordered ? (list.start ?? 1) : undefined;

  return (
    <Tag
      key={key}
      className={`sbk-rich-list sbk-rich-list--${style}`}
      start={start}
      data-indent={list.ordered ? undefined : depth}
      style={list.ordered ? { listStyleType: "decimal" } : undefined}
    >
      {list.children.map((item, i) => renderListItem(item, i, depth))}
    </Tag>
  );
}

function renderListItem(item: ListItem, key: number, depth: number): ReactNode {
  const paragraphs = item.children.filter((c): c is Paragraph => c.type === "paragraph");
  const nestedLists = item.children.filter((c): c is List => c.type === "list");

  return (
    <li key={key} className="sbk-rich-list__item">
      {paragraphs.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderInline(p.children)}
        </Fragment>
      ))}
      {nestedLists.map((nested, i) => renderList(nested, i, depth + 1))}
    </li>
  );
}

function renderTable(table: Table, key: number): ReactNode {
  return <MarkdownTable key={key} table={table} />;
}

function MarkdownTable({ table }: { table: Table }) {
  const [headerRow, ...bodyRows] = table.children;
  const align = table.align ?? [];
  const tableRef = useRef<HTMLTableElement>(null);

  return (
    <div className="sbk-hover-actions-host sbk-hover-actions-host--fit">
      <div className="sbk-markdown__table-wrap">
        <table className="sbk-markdown__table" ref={tableRef}>
          {headerRow && (
            <thead>
              <tr>
                {headerRow.children.map((cell, i) => (
                  <th key={i} style={{ textAlign: align[i] ?? undefined }}>
                    {renderInline(cell.children)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {bodyRows.map((row: TableRow, i) => (
              <tr key={i}>
                {row.children.map((cell: TableCell, j) => (
                  <td key={j} style={{ textAlign: align[j] ?? undefined }}>
                    {renderInline(cell.children)}
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

function renderInline(nodes: PhrasingContent[], depth = 0): ReactNode {
  if (depth >= MAX_DEPTH) return nodes.map(plainText).join("");
  return nodes.map((node, i) => <Fragment key={i}>{renderInlineNode(node, depth)}</Fragment>);
}

function renderInlineNode(node: PhrasingContent, depth: number): ReactNode {
  switch (node.type) {
    case "text":
      return renderTextWithEmoji((node as Text).value);
    case "strong":
      return <b>{renderInline(node.children, depth + 1)}</b>;
    case "emphasis":
      return <i>{renderInline(node.children, depth + 1)}</i>;
    case "delete":
      return <s>{renderInline(node.children, depth + 1)}</s>;
    case "inlineCode":
      return <code className="sbk-mrkdwn__code">{(node as InlineCode).value}</code>;
    case "link": {
      const link = node as Link;
      return (
        <TextLink className="sbk-link" href={link.url} target="_blank" rel="noopener noreferrer">
          {renderInline(link.children, depth + 1)}
        </TextLink>
      );
    }
    case "break":
      return <br />;
    default:
      return null;
  }
}

function renderTextWithEmoji(value: string): ReactNode {
  const nodes = parsePlainTextEmoji(value);
  return nodes.map((node, i) =>
    node.type === "emoji" ? (
      <Emoji key={i} name={node.name} skinTone={node.skinTone} size={22} />
    ) : (
      <Fragment key={i}>{renderSoftBreaks(node.value)}</Fragment>
    ),
  );
}

/** A GFM "lazy continuation" line within a paragraph/blockquote is a literal `\n` in the text
 * node's value; render each as a visual line break rather than letting it collapse to a space. */
function renderSoftBreaks(value: string): ReactNode {
  const lines = value.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}
