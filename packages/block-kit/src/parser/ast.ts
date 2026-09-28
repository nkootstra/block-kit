/** Nodes produced by {@link parse}. Plain objects so they can cross any serialization boundary. */
export type MrkdwnNode = BlockNode | InlineNode;

export interface Root {
  type: "root";
  children: MrkdwnNode[];
}

export type BlockNode = Preformatted | Quote;

/** A ``` fenced block. Content is shown verbatim, only HTML entities are decoded. */
export interface Preformatted {
  type: "preformatted";
  value: string;
}

/** Lines starting with `>`, or everything after `>>>`. */
export interface Quote {
  type: "quote";
  children: InlineNode[];
}

export type InlineNode =
  | Text
  | Bold
  | Italic
  | Strike
  | Code
  | Link
  | UserMention
  | ChannelMention
  | UsergroupMention
  | Broadcast
  | DateNode
  | Emoji;

/** Plain text. May contain `\n`, which renderers should turn into line breaks. */
export interface Text {
  type: "text";
  value: string;
}

export interface Bold {
  type: "bold";
  children: InlineNode[];
}

export interface Italic {
  type: "italic";
  children: InlineNode[];
}

export interface Strike {
  type: "strike";
  children: InlineNode[];
}

export interface Code {
  type: "code";
  value: string;
}

/** `<https://example.com|label>` or an auto-linked bare URL. */
export interface Link {
  type: "link";
  url: string;
  /** Parsed label. Absent when the link has no `|label` part, in which case the URL is shown. */
  children?: InlineNode[];
}

/** `<@U123>` or the legacy `<@U123|name>`. */
export interface UserMention {
  type: "user";
  id: string;
  label?: string;
}

/** `<#C123>` or `<#C123|name>`. */
export interface ChannelMention {
  type: "channel";
  id: string;
  label?: string;
}

/** `<!subteam^S123>` or `<!subteam^S123|@handle>`. */
export interface UsergroupMention {
  type: "usergroup";
  id: string;
  label?: string;
}

/** `<!here>`, `<!channel>`, `<!everyone>`. */
export interface Broadcast {
  type: "broadcast";
  range: "here" | "channel" | "everyone";
  label?: string;
}

/** `<!date^1392734382^{date_short} at {time}^https://link|fallback>`. */
export interface DateNode {
  type: "date";
  /** Unix timestamp in seconds. */
  timestamp: number;
  /** Format string with `{token}` placeholders. */
  format: string;
  url?: string;
  fallback: string;
}

/** `:smile:` or `:thumbsup::skin-tone-3:`. Renderers fall back to the raw text for unknown names. */
export interface Emoji {
  type: "emoji";
  name: string;
  /** 2–6, as in Slack's `skin-tone-N` modifiers. */
  skinTone?: number;
}
