import type {
  RichTextBlock,
  RichTextBlockElement,
  RichTextElement,
  RichTextList,
  RichTextQuote,
  RichTextSection,
} from "@slack/types";
import { formatSlackDate } from "../parser";
import { Fragment, type ReactNode } from "react";
import { useBlockKit } from "../context";
import { Emoji } from "../emoji";
import { LinkHoverCard } from "../HoverCard";
import { Link, MentionLink } from "../Link";
import { PrivateChannel } from "../Mrkdwn";
import type { BlockProps } from "../types";
import { PrivateUser, UnavailableUsergroup, UserMention } from "../UserMention";
import {
  CopyIcon,
  EyeClosedIcon,
  LinkIcon,
  LockFilledIcon,
  MessageIcon,
  TrashIcon,
} from "../icons";
import { CodeBlock } from "./CodeBlock";

// Builder-only/undocumented extensions to `@slack/types`' definitions.
type RichTextListExt = RichTextList & { offset?: number };
type RichTextEmojiExt = Extract<RichTextElement, { type: "emoji" }> & { skin_tone?: number };
type RichTextPreformattedExt = Extract<RichTextBlockElement, { type: "rich_text_preformatted" }> & {
  language?: string;
};
/** A coloured label, e.g. `{ type: "tag", text: "In progress", color: "blue" }`. */
interface RichTextTag {
  type: "tag";
  text: string;
  color?: string;
  style?: RichTextElement["style"];
}

/** A field of a Salesforce record, e.g. `{ type: "salesforce_data_field", salesforce_record_id,
 * salesforce_field_label: "Amount" }`. */
interface RichTextSalesforceDataField {
  type: "salesforce_data_field";
  salesforce_record_id: string;
  salesforce_field_label?: string;
  salesforce_include_field_label?: boolean;
  style?: RichTextElement["style"];
}

/**
 * Elements that point at something only Slack can look up: a user mentioned in a canvas, a
 * workflow, a message, a file, a canvas, a list, an app's work object or an attachment, e.g. `{ type: "canvas", file_id: "F0123456789" }`.
 */
type RichTextEntity =
  | { type: "canvas_user_mention"; user_id: string }
  | { type: "workflow_mention"; workflow_id: string; text?: string }
  | { type: "message_mention"; channel_id: string; message_ts: string }
  | { type: "file" | "canvas" | "list_record"; file_id: string; text?: string }
  | { type: "work_object_mention"; entity_id: string; app_id?: string; text?: string; url: string }
  | { type: "attachment_mention"; url: string; text?: string }
  | {
      type: "citation";
      url: string;
      text?: string;
      index: number;
      details?: { citation_type?: string; display_name?: string; title?: string; snippet?: string };
    };
type RichTextEntityLeaf = RichTextEntity & { style?: RichTextElement["style"] };

/** Salesforce's cloud, as Slack draws it before a record's field (`sf-cloud-filled`). */
const SALESFORCE_CLOUD =
  "M5.959 3.36c1.061.03 2.01.397 2.725 1.03a3.7 3.7 0 0 1 2.083-.639 3.75 3.75 0 0 1 2.897 1.383 4.2 4.2 0 0 1 1.182-.176 4.4 4.4 0 0 1 4.404 4.404 4.4 4.4 0 0 1-4.757 4.39 3.44 3.44 0 0 1-2.715 1.32q-.43-.001-.82-.097a3.79 3.79 0 0 1-3.16 1.664 3.81 3.81 0 0 1-3.322-1.929q-.068.004-.137.004a3.591 3.591 0 0 1-2.32-6.33 4.2 4.2 0 0 1-.127-1.012C1.892 5.16 3.7 3.36 5.937 3.36z";

type Resolvers = ReturnType<typeof useBlockKit>["resolvers"];

export interface RenderCtx {
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
      const lists = forest.map((group) => renderListGroup(group, ctx, key++, 0));
      if (!forest.some((group) => group.border)) {
        nodes.push(...lists);
        continue;
      }
      // Slack draws a list with `border: 1` inside a quote, and the quotes right after it join that
      // same quote: one bar down the side, one 4px margin above and below the group.
      const quoted: ReactNode[] = [];
      while (i < elements.length && elements[i]?.type === "rich_text_quote") {
        quoted.push(
          <div key={key++} className="sbk-rich-text__quote-text">
            {renderSectionChildren((elements[i] as RichTextQuote).elements, ctx)}
          </div>,
        );
        i++;
      }
      nodes.push(
        <blockquote key={key++} className="sbk-rich-text__quote sbk-rich-text__quote--group">
          {lists}
          {quoted}
        </blockquote>,
      );
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
          const pre = (
            <pre key={key++} className="sbk-rich-text__pre">
              {renderPreformattedLines(el.elements)}
              <span className="sbk-rich-text__pre-copy" aria-label="Copy code">
                <CopyIcon width={16} height={16} />
              </span>
            </pre>
          );
          // Like a bordered list, Slack draws a bordered block inside a quote
          // (extra/fidelity/rich-text-rich-text-preformatted/mixed).
          nodes.push(
            (el as RichTextPreformattedExt).border ? (
              <blockquote key={key++} className="sbk-rich-text__quote sbk-rich-text__quote--group">
                {pre}
              </blockquote>
            ) : (
              pre
            ),
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

  return mergeTextRuns(elements).map((el, i) => (
    <Fragment key={i}>{renderLeaf(el, ctx, 22, i === 0)}</Fragment>
  ));
}

/**
 * Slack writes consecutive `text` elements with the same style as one text node ("item 2: " and
 * "this is a list item" become "item 2: this is a list item"), so they render, wrap and select as
 * one run of text.
 */
function mergeTextRuns(elements: RichTextElement[]): RichTextElement[] {
  const merged: RichTextElement[] = [];
  for (const el of elements) {
    const prev = merged[merged.length - 1];
    if (
      el.type === "text" &&
      prev?.type === "text" &&
      JSON.stringify(prev.style ?? {}) === JSON.stringify(el.style ?? {})
    ) {
      merged[merged.length - 1] = { ...prev, text: prev.text + el.text };
    } else {
      merged.push(el);
    }
  }
  return merged;
}

/** One inline element of a section, styled. The rich text input's editor draws its initial value
 * with it too. */
export function renderLeaf(
  el: RichTextElement | RichTextTag | RichTextSalesforceDataField | RichTextEntityLeaf,
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
        <LinkHoverCard url={el.url}>
          <Link className="sbk-link" href={el.url} target="_blank" rel="noopener noreferrer">
            {el.text || el.url}
          </Link>
        </LinkHoverCard>
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
        <PrivateUser id={el.user_id} />
      );
      break;
    }
    // extra/fidelity/rich-text-canvas-user-mention: drawn like a user mention.
    case "canvas_user_mention": {
      const name = ctx.resolvers.user?.(el.user_id);
      content = name ? (
        <UserMention id={el.user_id} name={name} />
      ) : (
        <PrivateUser id={el.user_id} />
      );
      break;
    }
    case "usergroup": {
      const name = ctx.resolvers.usergroup?.(el.usergroup_id);
      content = name ? (
        <MentionLink type="usergroup" id={el.usergroup_id}>
          {`@${name}`}
        </MentionLink>
      ) : (
        <UnavailableUsergroup />
      );
      break;
    }
    case "channel": {
      const name = ctx.resolvers.channel?.(el.channel_id);
      content = name ? (
        <MentionLink type="channel" id={el.channel_id}>
          {`#${name}`}
        </MentionLink>
      ) : (
        <PrivateChannel />
      );
      break;
    }
    case "broadcast":
      content = <span className="sbk-mention--broadcast">{`@${el.range}`}</span>;
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
    case "tag":
      // extra/fidelity/rich-text-tag/default: Slack's `tag-span`, a 24px pill in the tag's colour.
      // Blue is the only colour captured so far; any other draws as blue until it is.
      content = <span className="sbk-rich-text__tag">{el.text}</span>;
      break;
    case "salesforce_data_field":
      // extra/fidelity/rich-text-salesforce-data-field/default: a renderer outside Slack can't
      // read the record, so the field shows as Slack shows a record it can't reach, a greyed
      // mention-blue pill with Salesforce's cloud and "Record was deleted".
      content = (
        <span
          className="sbk-rich-text__salesforce sbk-rich-text__salesforce--disabled"
          data-id={el.salesforce_record_id}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path fill="currentColor" d={SALESFORCE_CLOUD} />
          </svg>
          Record was deleted
        </span>
      );
      break;
    // extra/fidelity/rich-text-{workflow-mention,message-mention,file,canvas,list-record}/default: Slack
    // can't look these up for the Builder's preview either, and shows what it shows a person
    // without access, whatever text the payload gives.
    case "workflow_mention":
      content = <Slug icon={<TrashIcon />} label="Deleted workflow" disabled />;
      break;
    case "message_mention":
      content = <Slug icon={<MessageIcon />} label="Private message" disabled />;
      break;
    case "file":
      content = <Slug icon={<EyeClosedIcon />} label="Hidden file" disabled />;
      break;
    case "canvas":
      content = <Slug icon={<LockFilledIcon />} label="Private canvas" />;
      break;
    case "list_record":
      content = <Slug icon={<LockFilledIcon />} label="Private list" />;
      break;
    // extra/fidelity/rich-text-work-object-mention/default: the payload's text, linked, behind the
    // app's icon from resolvers.app. Without one Slack shows its default app icon, an image we
    // can't use, so the icon is a square in the colour of a message's placeholder avatar.
    case "work_object_mention": {
      const iconUrl = el.app_id ? ctx.resolvers.app?.(el.app_id)?.iconUrl : undefined;
      content = (
        <Link
          className="sbk-link sbk-rich-text__entity-link"
          href={el.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Slug
            icon={
              iconUrl ? (
                <img className="sbk-rich-text__slug-app" src={iconUrl} alt="" />
              ) : (
                <span className="sbk-rich-text__slug-app" aria-hidden="true" />
              )
            }
            label={el.text || el.url}
          />
        </Link>
      );
      break;
    }
    // extra/fidelity/rich-text-attachment-mention/default: a plain link.
    case "attachment_mention":
      content = (
        <Link
          className="sbk-link sbk-rich-text__entity-link"
          href={el.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {el.text || el.url}
        </Link>
      );
      break;
    // extra/fidelity/rich-text-citation/default: Slack's citation chip, "1 · 🔗 example.com",
    // linked to the source.
    case "citation":
      content = (
        <Link
          className="sbk-link sbk-rich-text__citation"
          href={el.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="sbk-rich-text__citation-contents">
            <b>{el.index}</b>·<LinkIcon />
            {el.details?.display_name || el.text || el.url}
          </span>
        </Link>
      );
      break;
    default:
      content = null;
  }

  return applyStyle(content, el.style);
}

/** Slack's `p-rich_text_slug`: an entity as an inline pill, its icon before its label. A greyed
 * out (`--disabled`) one is something the viewer can't open. */
function Slug({ icon, label, disabled }: { icon: ReactNode; label: string; disabled?: boolean }) {
  return (
    <span
      className={
        disabled ? "sbk-rich-text__slug sbk-rich-text__slug--disabled" : "sbk-rich-text__slug"
      }
    >
      {icon}
      <span>{label}</span>
    </span>
  );
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
            <LinkHoverCard url={el.url}>
              <Link className="sbk-link" href={el.url} target="_blank" rel="noopener noreferrer">
                {el.text || el.url}
              </Link>
            </LinkHoverCard>,
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

    // A list that continues the one before it keeps counting; Slack ignores its offset there
    // (extra/fidelity/rich-text-rich-text-list/many-items numbers it 11, after ten items).
    if (top && top.indent === indent && top.style === block.style) {
      for (const section of block.elements) top.items.push({ section, children: [] });
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
        <li key={i} className="sbk-rich-list__item">
          {renderSectionChildren(item.section.elements, ctx)}
          {item.children.map((child, j) => renderListGroup(child, ctx, j, depth + 1))}
        </li>
      ))}
    </Tag>
  );
}
