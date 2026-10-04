import type {
  RichTextBlock,
  RichTextBlockElement,
  RichTextElement,
  RichTextList,
  RichTextSection,
} from "@slack/types";
import { formatSlackDate } from "../parser";
import { Fragment, type ReactNode } from "react";
import { useBlockKit } from "../context";
import { Emoji } from "../emoji";
import { Link, MentionLink } from "../Link";
import { LockIcon } from "../Mrkdwn";
import type { BlockProps } from "../types";
import { UserMention } from "../UserMention";
import { CopyIcon } from "../icons";
import { CodeBlock } from "./CodeBlock";

// Builder-only/undocumented extensions to `@slack/types`' definitions.
type RichTextListExt = RichTextList & { offset?: number };
type RichTextEmojiExt = Extract<RichTextElement, { type: "emoji" }> & { skin_tone?: number };
type RichTextPreformattedExt = Extract<RichTextBlockElement, { type: "rich_text_preformatted" }> & {
  language?: string;
};

type Resolvers = ReturnType<typeof useBlockKit>["resolvers"];

interface RenderCtx {
  resolvers: Resolvers;
  timeZone: string | undefined;
}

export function RichText({ block }: BlockProps<RichTextBlock>) {
  const { resolvers, timeZone } = useBlockKit();
  const ctx: RenderCtx = { resolvers, timeZone };
  return <div className="sbk-rich-text">{renderTopLevel(block.elements ?? [], ctx)}</div>;
}

function renderTopLevel(elements: RichTextBlockElement[], ctx: RenderCtx): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < elements.length) {
    const el = elements[i];
    if (!el) {
      i++;
      continue;
    }
    if (el.type === "rich_text_list") {
      const run: RichTextListExt[] = [];
      while (i < elements.length && elements[i]?.type === "rich_text_list") {
        run.push(elements[i] as RichTextListExt);
        i++;
      }
      const forest = buildListForest(run);
      for (const group of forest) nodes.push(renderListGroup(group, ctx, key++, 0));
      continue;
    }
    switch (el.type) {
      case "rich_text_section":
        nodes.push(
          <div key={key++} className="sbk-rich-text__section">
            {renderSectionChildren(el.elements, ctx)}
          </div>,
        );
        break;
      case "rich_text_quote":
        nodes.push(
          <blockquote key={key++} className="sbk-rich-text__quote">
            {renderSectionChildren(el.elements, ctx)}
          </blockquote>,
        );
        break;
      case "rich_text_preformatted": {
        const language = (el as RichTextPreformattedExt).language;
        if (language) {
          const code = el.elements
            .map((leaf) =>
              leaf.type === "text" ? leaf.text : leaf.type === "link" ? leaf.text || leaf.url : "",
            )
            .join("");
          nodes.push(<CodeBlock key={key++} language={language} code={code} />);
        } else {
          nodes.push(
            <pre key={key++} className="sbk-rich-text__pre">
              {renderPreformattedLines(el.elements)}
              <span className="sbk-rich-text__pre-copy" aria-label="Copy code">
                <CopyIcon width={16} height={16} />
              </span>
            </pre>,
          );
        }
        break;
      }
      default:
        break;
    }
    i++;
  }
  return nodes;
}

/** A section renders "jumbo" 32px emoji when it consists only of emoji (and whitespace). */
function renderSectionChildren(elements: RichTextElement[], ctx: RenderCtx): ReactNode {
  const isJumbo =
    elements.some((el) => el.type === "emoji") &&
    elements.every((el) => el.type === "emoji" || (el.type === "text" && el.text.trim() === ""));

  if (isJumbo) {
    return (
      <span className="sbk-rich-text__jumbo-emoji">
        {elements
          .filter((el) => el.type === "emoji")
          .map((el, i) => (
            <Fragment key={i}>{renderLeaf(el, ctx, 32)}</Fragment>
          ))}
      </span>
    );
  }

  return elements.map((el, i) => <Fragment key={i}>{renderLeaf(el, ctx, 22, i === 0)}</Fragment>);
}

function renderLeaf(
  el: RichTextElement,
  ctx: RenderCtx,
  emojiSize: number,
  isFirst = false,
): ReactNode {
  let content: ReactNode;
  switch (el.type) {
    case "text":
      content = renderTextWithBreaks(el.text, isFirst);
      break;
    case "link":
      content = (
        <Link className="sbk-link" href={el.url} target="_blank" rel="noopener noreferrer">
          {el.text || el.url}
        </Link>
      );
      break;
    case "emoji": {
      const emoji = el as RichTextEmojiExt;
      content = <Emoji name={emoji.name} skinTone={emoji.skin_tone} size={emojiSize} />;
      break;
    }
    case "user": {
      const name = ctx.resolvers.user?.(el.user_id);
      content = name ? (
        <UserMention id={el.user_id} name={name} />
      ) : (
        <span className="sbk-mention--unresolved" aria-label={`@${el.user_id}`} />
      );
      break;
    }
    case "usergroup": {
      const name = ctx.resolvers.usergroup?.(el.usergroup_id);
      content = name ? (
        <MentionLink type="usergroup" id={el.usergroup_id}>
          @{name}
        </MentionLink>
      ) : (
        <span className="sbk-mention--loading" aria-label="Loading user group" />
      );
      break;
    }
    case "channel": {
      const name = ctx.resolvers.channel?.(el.channel_id);
      content = name ? (
        <MentionLink type="channel" id={el.channel_id}>
          #{name}
        </MentionLink>
      ) : (
        <span className="sbk-mention--private">
          <LockIcon />
          Private channel
        </span>
      );
      break;
    }
    case "broadcast":
      content = <span className="sbk-mention--broadcast">@{el.range}</span>;
      break;
    case "date": {
      const text = formatSlackDate(el.timestamp, el.format, { timeZone: ctx.timeZone });
      content = el.url ? (
        <Link className="sbk-link" href={el.url} target="_blank" rel="noopener noreferrer">
          {text}
        </Link>
      ) : (
        <span className="sbk-mrkdwn__date">{text}</span>
      );
      break;
    }
    case "color":
      content = (
        <Fragment>
          {el.value}
          <span
            className="sbk-rich-text__color-swatch"
            style={{ background: el.value }}
            aria-label={el.value}
          />
        </Fragment>
      );
      break;
    case "team":
      content = <span className="sbk-mention--unresolved" aria-label={`@${el.team_id}`} />;
      break;
    default:
      content = null;
  }

  return applyStyle(content, el.style);
}

function applyStyle(content: ReactNode, style: RichTextElement["style"] | undefined): ReactNode {
  if (!style) return content;
  let node = content;
  if (style.underline) node = <u>{node}</u>;
  if (style.strike) node = <s>{node}</s>;
  if (style.italic) node = <i>{node}</i>;
  if (style.bold) node = <b>{node}</b>;
  if (style.code) node = <code className="sbk-mrkdwn__code">{node}</code>;
  return node;
}

/**
 * A run of 2+ `\n`s (a paragraph gap) always collapses to a small fixed-height spacer, regardless
 * of where it sits. A single `\n` renders as a literal `<br/>` — which, left to normal browser
 * layout, already does the right thing at both ends: a *trailing* `<br/>` (nothing after it in the
 * section) naturally contributes no extra height, and a *mid-content* one (real content before and
 * after) inserts a full line break. The one case the browser gets "wrong" for our purposes is a
 * *leading* single `\n` (nothing meaningful before it): natively that reserves a whole blank line,
 * but the Builder instead shows the same small spacer used for multi-`\n` gaps — so that one case
 * is special-cased explicitly.
 */
function renderTextWithBreaks(value: string, isFirst: boolean): ReactNode {
  const parts = value.split(/(\n+)/);
  // `split` on a capturing regex leaves an empty "" entry wherever the match sits at the very
  // start of the string, so the real leading run lives at index 1, not index 0.
  const firstNonEmpty = parts.findIndex((p) => p !== "");
  return parts.map((part, i) => {
    if (part === "") return null;
    if (/^\n+$/.test(part)) {
      const isLeading = isFirst && i === firstNonEmpty;
      if (part.length === 1 && !isLeading) return <br key={i} />;
      return <span key={i} className="sbk-rich-text__br" />;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * Preformatted blocks (without a `language`) wrap long lines normally, and — unlike a regular
 * rich_text section — a `\n` here is a literal hard break: `white-space: pre-wrap` on the `<pre>`
 * already renders each one as a real line, so a `\n\n` run naturally produces one full blank line
 * rather than the compact spacer used elsewhere. That means the raw text can be rendered as-is,
 * with no custom newline splitting.
 */
function renderPreformattedLines(
  elements: Extract<RichTextElement, { type: "text" | "link" }>[],
): ReactNode {
  return elements.map((el, i) => {
    if (el.type === "link") {
      return (
        <Fragment key={i}>
          {applyStyle(
            <Link className="sbk-link" href={el.url} target="_blank" rel="noopener noreferrer">
              {el.text || el.url}
            </Link>,
            el.style,
          )}
        </Fragment>
      );
    }
    return <Fragment key={i}>{applyStyle(el.text, el.style)}</Fragment>;
  });
}

// --- List grouping/nesting -------------------------------------------------
//
// Slack merges consecutive `rich_text_list` blocks into one continuous outline: a block whose
// `indent` is deeper than the running list nests inside the last item of that list, and a block
// whose `indent`/`style` matches the current list at that depth continues it (this is how the
// Builder renders e.g. an ordered list, an indented bullet aside, then more of the ordered list,
// as a single properly nested <ol>/<ul> tree).

interface ListItem {
  section: RichTextSection;
  children: ListGroup[];
  /** Explicit start value for this <li>, used to honor a list's `offset`. */
  value?: number;
}

interface ListGroup {
  style: "bullet" | "ordered";
  indent: number;
  border?: number;
  startValue?: number;
  items: ListItem[];
}

function buildListForest(run: RichTextListExt[]): ListGroup[] {
  const forest: ListGroup[] = [];
  const stack: ListGroup[] = [];

  for (const block of run) {
    const indent = block.indent ?? 0;
    while (stack.length > 0 && (stack[stack.length - 1] as ListGroup).indent > indent) {
      stack.pop();
    }
    let top = stack[stack.length - 1];

    if (top && top.indent === indent && top.style === block.style) {
      const startCount = top.items.length;
      for (const section of block.elements) top.items.push({ section, children: [] });
      if (block.offset != null && top.style === "ordered") {
        const firstNew = top.items[startCount];
        if (firstNew) firstNew.value = block.offset + 1;
      }
      continue;
    }

    if (top && top.indent === indent) {
      // Same depth, different style: end the current list and start a fresh one alongside it.
      stack.pop();
      top = stack[stack.length - 1];
    }

    const group: ListGroup = {
      style: block.style,
      indent,
      border: block.border,
      startValue: block.style === "ordered" ? (block.offset ?? 0) + 1 : undefined,
      items: block.elements.map((section) => ({ section, children: [] })),
    };

    if (top && top.indent < indent) {
      const parentItem = top.items[top.items.length - 1];
      if (parentItem) parentItem.children.push(group);
      else forest.push(group);
    } else {
      forest.push(group);
    }
    stack.push(group);
  }

  return forest;
}

/** Ordered lists count in the browser's markers; bullets are Slack's icon glyphs, drawn in CSS. */
const ORDERED_MARKERS = ["decimal", "lower-alpha", "lower-roman"];

function renderListGroup(group: ListGroup, ctx: RenderCtx, key: number, depth: number): ReactNode {
  const Tag = group.style === "ordered" ? "ol" : "ul";
  const ordered = group.style === "ordered";
  const className = `sbk-rich-list sbk-rich-list--${group.style}${group.border ? " sbk-rich-list--bordered" : ""}`;

  return (
    <Tag
      key={key}
      className={className}
      start={group.startValue}
      data-indent={ordered ? undefined : group.indent}
      style={ordered ? { listStyleType: ORDERED_MARKERS[depth % 3] } : undefined}
    >
      {group.items.map((item, i) => (
        <li key={i} value={item.value} className="sbk-rich-list__item">
          {renderSectionChildren(item.section.elements, ctx)}
          {item.children.map((child, j) => renderListGroup(child, ctx, j, depth + 1))}
        </li>
      ))}
    </Tag>
  );
}
