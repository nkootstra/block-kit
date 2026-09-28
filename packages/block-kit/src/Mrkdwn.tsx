import { formatSlackDate, type InlineNode, type MrkdwnNode, parse } from "./parser";
import { Fragment, type ReactNode } from "react";
import { useBlockKit } from "./context";
import { Emoji } from "./emoji";
import { UserMention } from "./UserMention";

export interface MrkdwnProps {
  text: string;
  /** Slack's `verbatim` flag. When false (the default), bare URLs are linked. */
  verbatim?: boolean;
  /** Pixel size for `:emoji:` images. Defaults to 22 (Slack's inline size at 15px text). */
  emojiSize?: number;
}

/** Renders a Slack mrkdwn string. */
export function Mrkdwn({ text, verbatim = false, emojiSize = 22 }: MrkdwnProps) {
  const { resolvers, timeZone } = useBlockKit();
  const root = parse(text, { verbatim });
  return (
    <span className="sbk-mrkdwn">{renderNodes(root.children, resolvers, timeZone, emojiSize)}</span>
  );
}

function renderNodes(
  nodes: MrkdwnNode[],
  resolvers: ReturnType<typeof useBlockKit>["resolvers"],
  timeZone: string | undefined,
  emojiSize: number,
): ReactNode[] {
  return nodes.map((node, i) => (
    <Fragment key={i}>{renderNode(node, resolvers, timeZone, emojiSize)}</Fragment>
  ));
}

function renderNode(
  node: MrkdwnNode,
  resolvers: ReturnType<typeof useBlockKit>["resolvers"],
  timeZone: string | undefined,
  emojiSize: number,
): ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node.value);
    case "bold":
      return <b>{renderNodes(node.children, resolvers, timeZone, emojiSize)}</b>;
    case "italic":
      return <i>{renderNodes(node.children, resolvers, timeZone, emojiSize)}</i>;
    case "strike":
      return <s>{renderNodes(node.children, resolvers, timeZone, emojiSize)}</s>;
    case "code":
      return <code className="sbk-mrkdwn__code">{node.value}</code>;
    case "preformatted":
      return <pre className="sbk-mrkdwn__pre">{node.value}</pre>;
    case "quote":
      return (
        <blockquote className="sbk-mrkdwn__quote">
          {renderNodes(node.children, resolvers, timeZone, emojiSize)}
        </blockquote>
      );
    case "link":
      return (
        <a className="sbk-link" href={node.url} target="_blank" rel="noopener noreferrer">
          {node.children ? renderNodes(node.children, resolvers, timeZone, emojiSize) : node.url}
        </a>
      );
    case "user": {
      const name = resolvers.user?.(node.id);
      return name ? <UserMention id={node.id} name={name} /> : <Fragment>@{node.id}</Fragment>;
    }
    case "usergroup": {
      // The Builder shows an empty loading pill for subteam mentions it can't resolve live, even
      // when the message carries a `|label` fallback — the label is ignored for display.
      const name = resolvers.usergroup?.(node.id);
      return name ? (
        <span className="sbk-mention">@{name}</span>
      ) : (
        <span className="sbk-mention--loading" aria-label="Loading user group" />
      );
    }
    case "channel": {
      const name = resolvers.channel?.(node.id) ?? node.label;
      return name ? (
        <span className="sbk-mention">#{name}</span>
      ) : (
        <span className="sbk-mention--private">
          <LockIcon />
          Private channel
        </span>
      );
    }
    case "broadcast":
      return <span className="sbk-mention--broadcast">@{node.range}</span>;
    case "date": {
      const text = formatSlackDate(node.timestamp, node.format, { timeZone });
      return node.url ? (
        <a className="sbk-link" href={node.url} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      ) : (
        <span className="sbk-mrkdwn__date">{text}</span>
      );
    }
    case "emoji":
      return <Emoji name={node.name} skinTone={node.skinTone} size={emojiSize} />;
  }
}

/** Matches the lock glyph Slack shows on an unresolved private channel mention. */
export function LockIcon() {
  return (
    <svg
      className="sbk-mention__lock-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 1.5A4.5 4.5 0 0 0 5.5 6v1.5h-.25A2.25 2.25 0 0 0 3 9.75v6.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0 0 17 16.25v-6.5a2.25 2.25 0 0 0-2.25-2.25h-.25V6A4.5 4.5 0 0 0 10 1.5m3 6V6a3 3 0 1 0-6 0v1.5zM4.5 9.75A.75.75 0 0 1 5.25 9h9.5a.75.75 0 0 1 .75.75v6.5a.25.25 0 0 1-.25.25H4.75a.25.25 0 0 1-.25-.25z"
      />
    </svg>
  );
}

function renderText(value: string): ReactNode {
  const lines = value.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

export type { InlineNode };
