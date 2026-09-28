import type { MrkdwnElement, PlainTextElement } from "@slack/types";
import { parsePlainTextEmoji } from "./parser";
import { Fragment } from "react";
import { Emoji } from "./emoji";
import { Mrkdwn } from "./Mrkdwn";

export type TextObject = PlainTextElement | MrkdwnElement;

export interface TextProps {
  text: TextObject;
  /** Pixel size for `:emoji:` images. Defaults to 22 (Slack's inline size at 15px text). */
  emojiSize?: number;
}

/** Renders a Block Kit text object. */
export function Text({ text, emojiSize = 22 }: TextProps) {
  if (text.type === "mrkdwn") {
    return <Mrkdwn text={text.text} verbatim={text.verbatim} emojiSize={emojiSize} />;
  }

  // plain_text converts `:name:` shortcodes to emoji by default; `emoji: false` opts out.
  const emoji = (text as PlainTextElement).emoji ?? true;
  if (!emoji) return <span className="sbk-plain-text">{text.text}</span>;

  const nodes = parsePlainTextEmoji(text.text);
  return (
    <span className="sbk-plain-text">
      {nodes.map((node, i) => (
        <Fragment key={i}>
          {node.type === "emoji" ? (
            <Emoji name={node.name} skinTone={node.skinTone} size={emojiSize} />
          ) : (
            node.value
          )}
        </Fragment>
      ))}
    </span>
  );
}
