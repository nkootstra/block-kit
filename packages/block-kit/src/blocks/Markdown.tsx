import type { MarkdownBlock } from "@slack/types";
import { parsePlainTextEmoji } from "../parser";
import type {
  Blockquote,
  Code,
  Heading,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
  Text,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { Fragment, type ReactNode, useRef } from "react";
import { TableActions } from "../data/HoverActions";
import { Emoji } from "../emoji";
import type { BlockProps } from "../types";
import { CodeBlock } from "./CodeBlock";

/**
 * Renders the (Builder-only) `markdown` block: a GitHub-flavored-markdown string that the Builder
 * converts into a run of the same building blocks used elsewhere (headers, dividers, rich-text-like
 * paragraphs, code snippets, tables). We parse with `mdast-util-from-markdown` + GFM and reuse those
 * blocks' own CSS classes so the two stay visually identical.
 */
export function Markdown({ block }: BlockProps<MarkdownBlock>) {
  const tree = parseMarkdown(block.text);
  return <div className="sbk-markdown">{renderBlocks(tree.children)}</div>;
}

function parseMarkdown(text: string): Root {
  return fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
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
    i++;
  }

  return nodes;
}

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

const MARKER_STYLES = ["disc", "circle", "square"];

function renderList(list: List, key: number, depth: number): ReactNode {
  const Tag = list.ordered ? "ol" : "ul";
  const style = list.ordered ? "ordered" : "bullet";
  const markerStyle = list.ordered ? "decimal" : MARKER_STYLES[depth % 3];
  const start = list.ordered ? (list.start ?? 1) : undefined;

  return (
    <Tag
      key={key}
      className={`sbk-rich-list sbk-rich-list--${style}`}
      start={start}
      style={{ listStyleType: markerStyle }}
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

function renderInline(nodes: PhrasingContent[]): ReactNode {
  return nodes.map((node, i) => <Fragment key={i}>{renderInlineNode(node)}</Fragment>);
}

function renderInlineNode(node: PhrasingContent): ReactNode {
  switch (node.type) {
    case "text":
      return renderTextWithEmoji((node as Text).value);
    case "strong":
      return <b>{renderInline(node.children)}</b>;
    case "emphasis":
      return <i>{renderInline(node.children)}</i>;
    case "delete":
      return <s>{renderInline(node.children)}</s>;
    case "inlineCode":
      return <code className="sbk-mrkdwn__code">{(node as InlineCode).value}</code>;
    case "link": {
      const link = node as Link;
      return (
        <a className="sbk-link" href={link.url} target="_blank" rel="noopener noreferrer">
          {renderInline(link.children)}
        </a>
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
