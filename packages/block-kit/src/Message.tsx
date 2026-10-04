import type { AnyBlock } from "@slack/types";
import { useMemo, useState } from "react";
import { Blocks } from "./Blocks";
import { actionTs, type MessageApi, type MessageUpdate, SurfaceScope } from "./context";
import { Mrkdwn } from "./Mrkdwn";
import { Tooltip } from "./Tooltip";
import { Link } from "./Link";

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Slack's timestamp tooltip, e.g. "Monday, September 27th at 4:54:45 AM". */
function fullTimestamp(time: Date, timeZone?: string): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    time.toLocaleString("en-US", { ...options, timeZone });
  const day = Number(part({ day: "numeric" }));
  const clock = part({ hour: "numeric", minute: "2-digit", second: "2-digit" });
  return `${part({ weekday: "long" })}, ${part({ month: "long" })} ${ordinal(day)} at ${clock}`;
}

export interface MessageApp {
  name: string;
  iconUrl?: string;
}

/** A reaction as Slack stores it on a message (`reactions[]` from conversations.history). */
export interface SlackReaction {
  name: string;
  count: number;
  users?: string[];
}

/** One field of a legacy attachment (`attachments[].fields[]`). */
export interface SlackAttachmentField {
  title: string;
  value: string;
  short?: boolean;
}

/** A legacy attachment, as Slack still renders it (colour bar, pretext, title, fields, footer). */
export interface SlackAttachment {
  color?: string;
  pretext?: string;
  author_name?: string;
  author_icon?: string;
  author_link?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: SlackAttachmentField[];
  image_url?: string;
  footer?: string;
  footer_icon?: string;
  ts?: string | number;
  /** Slack also lets attachments carry Block Kit blocks directly. */
  blocks?: AnyBlock[];
}

/** A message object as returned by `conversations.history` / stored by `@emulators/slack`. */
export interface SlackMessageLike {
  ts?: string;
  channel?: string;
  blocks?: AnyBlock[];
  text?: string;
  username?: string;
  icon_url?: string;
  icon_emoji?: string;
  bot_profile?: { name?: string; icons?: { image_72?: string; image_48?: string } };
  edited?: { ts?: string; user?: string };
  attachments?: SlackAttachment[];
  reactions?: SlackReaction[];
  reply_count?: number;
  reply_users_count?: number;
  latest_reply?: string;
  subscribed?: boolean;
}

export interface MessageProps {
  blocks?: AnyBlock[];
  /** Fallback text. Slack shows it only when there are no blocks. */
  text?: string;
  app?: MessageApp;
  /** Message timestamp (Slack `ts`, seconds). Defaults to now. */
  ts?: string | number;
  /** IANA zone for the displayed time. Defaults to the viewer's zone, like Slack. */
  timeZone?: string;
  /**
   * A Slack message object (e.g. from `conversations.history`, or as stored by
   * `@emulators/slack`). When given, it supplies blocks/text/ts and the sender header
   * (username/icon/bot_profile), plus attachments, reactions, thread summary and edited marker.
   * `blocks`/`text`/`app`/`ts` above still work standalone for simple previews.
   */
  message?: SlackMessageLike;
  /** The channel the message is in. Used for the `block_actions` container Slack would send. */
  channelId?: string;
  /** Slack's "Only visible to you" marker, shown for ephemeral messages. */
  isEphemeral?: boolean;
}

const DEFAULT_APP: MessageApp = { name: "Block Kit Preview" };

/** A message as it appears in a Slack channel: avatar, app name, APP badge, time and blocks. */
export function Message({
  blocks,
  text,
  app = DEFAULT_APP,
  ts,
  timeZone,
  message,
  channelId,
  isEphemeral,
}: MessageProps) {
  // Without a `ts`, the message is stamped once at mount, so its timestamp stays stable across
  // renders and interactions still produce a `block_actions` payload with a `message_ts`.
  const [mountTs] = useState(() => actionTs());
  const resolvedTs = message?.ts ?? (ts === undefined ? mountTs : String(ts));
  const time = new Date(Number(resolvedTs) * 1000);

  // What an app sent back through the action's `message` handle (`chat.update`/`response_url`).
  // It applies until the props change content, so editing the source still shows the edit.
  const source = JSON.stringify([message?.blocks, message?.text, blocks, text]);
  const [replaced, setReplaced] = useState<{ source: string; update: MessageUpdate | null }>();
  const override = replaced?.source === source ? replaced.update : undefined;
  const api = useMemo<MessageApi>(
    () => ({
      update: (update) => setReplaced({ source, update }),
      delete: () => setReplaced({ source, update: null }),
    }),
    [source],
  );

  const resolvedBlocks = override ? override.blocks : (message?.blocks ?? blocks);
  const resolvedText = override ? override.text : (message?.text ?? text);
  const header = resolveHeader(message, app);
  const ephemeral = isEphemeral ?? false;

  if (override === null) return null;

  return (
    <SurfaceScope
      container={{
        type: "message",
        messageTs: resolvedTs,
        channelId: message?.channel ?? channelId,
        isEphemeral: ephemeral,
        // Slack sends the message as it is now, so a replaced one carries its new content.
        message: override
          ? {
              type: "message",
              ...message,
              ts: resolvedTs,
              blocks: override.blocks,
              text: override.text,
            }
          : (message as Record<string, unknown> | undefined),
      }}
      message={api}
    >
      <div className="sbk-root sbk-message">
        {header.iconUrl ? (
          <img className="sbk-message__avatar" src={header.iconUrl} alt="" />
        ) : (
          <span className="sbk-message__avatar sbk-message__avatar--placeholder" aria-hidden>
            {header.name.charAt(0)}
          </span>
        )}
        <div className="sbk-message__content">
          <div className="sbk-message__header">
            <span className="sbk-message__sender">{header.name}</span>
            {header.isApp && <span className="sbk-message__badge">APP</span>}
            <Tooltip label={fullTimestamp(time, timeZone)}>
              <time className="sbk-message__time" dateTime={time.toISOString()}>
                {time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })}
              </time>
            </Tooltip>
            {message?.edited && <span className="sbk-message__edited">(edited)</span>}
          </div>

          {resolvedBlocks && resolvedBlocks.length > 0 ? (
            <Blocks blocks={resolvedBlocks} />
          ) : (
            resolvedText && <Mrkdwn text={resolvedText} />
          )}

          {message?.attachments && message.attachments.length > 0 && (
            <div className="sbk-attachments">
              {message.attachments.map((attachment, i) => (
                <Attachment key={i} attachment={attachment} />
              ))}
            </div>
          )}

          {message?.reactions && message.reactions.length > 0 && (
            <div className="sbk-reactions">
              {message.reactions.map((reaction) => (
                <Tooltip key={reaction.name} label={`:${reaction.name}:`}>
                  <span className="sbk-reactions__item">
                    <span className="sbk-reactions__emoji">:{reaction.name}:</span>
                    <span className="sbk-reactions__count">{reaction.count}</span>
                  </span>
                </Tooltip>
              ))}
            </div>
          )}

          {message && (message.reply_count ?? 0) > 0 && (
            <button type="button" className="sbk-thread-summary">
              <span className="sbk-thread-summary__count">
                {message.reply_count} {message.reply_count === 1 ? "reply" : "replies"}
              </span>
              {message.subscribed && <span className="sbk-thread-summary__subscribed">●</span>}
            </button>
          )}

          {ephemeral && <div className="sbk-message__ephemeral">Only visible to you</div>}
        </div>
      </div>
    </SurfaceScope>
  );
}

interface ResolvedHeader {
  name: string;
  iconUrl?: string;
  isApp: boolean;
}

function resolveHeader(message: SlackMessageLike | undefined, app: MessageApp): ResolvedHeader {
  if (!message) return { name: app.name, iconUrl: app.iconUrl, isApp: true };
  const name = message.username ?? message.bot_profile?.name ?? app.name;
  const iconUrl =
    message.icon_url ??
    message.bot_profile?.icons?.image_72 ??
    message.bot_profile?.icons?.image_48;
  return {
    name,
    iconUrl,
    isApp: Boolean(message.username || message.bot_profile || message.icon_url),
  };
}

function Attachment({ attachment }: { attachment: SlackAttachment }) {
  return (
    <div className="sbk-attachment" style={{ borderLeftColor: normalizeColor(attachment.color) }}>
      <div className="sbk-attachment__body">
        {attachment.pretext && (
          <div className="sbk-attachment__pretext">
            <Mrkdwn text={attachment.pretext} />
          </div>
        )}
        {attachment.author_name && (
          <div className="sbk-attachment__author">
            {attachment.author_icon && (
              <img className="sbk-attachment__author-icon" src={attachment.author_icon} alt="" />
            )}
            {attachment.author_link ? (
              <Link
                className="sbk-link"
                href={attachment.author_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {attachment.author_name}
              </Link>
            ) : (
              attachment.author_name
            )}
          </div>
        )}
        {attachment.title && (
          <div className="sbk-attachment__title">
            {attachment.title_link ? (
              <Link
                className="sbk-link"
                href={attachment.title_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {attachment.title}
              </Link>
            ) : (
              attachment.title
            )}
          </div>
        )}
        {attachment.text && (
          <div className="sbk-attachment__text">
            <Mrkdwn text={attachment.text} />
          </div>
        )}
        {attachment.fields && attachment.fields.length > 0 && (
          <div className="sbk-attachment__fields">
            {attachment.fields.map((field, i) => (
              <div
                key={i}
                className={`sbk-attachment__field${field.short ? " sbk-attachment__field--short" : ""}`}
              >
                <div className="sbk-attachment__field-title">{field.title}</div>
                <div className="sbk-attachment__field-value">
                  <Mrkdwn text={field.value} />
                </div>
              </div>
            ))}
          </div>
        )}
        {attachment.image_url && (
          <img className="sbk-attachment__image" src={attachment.image_url} alt="" />
        )}
        {attachment.blocks && attachment.blocks.length > 0 && <Blocks blocks={attachment.blocks} />}
        {attachment.footer && (
          <div className="sbk-attachment__footer">
            {attachment.footer_icon && (
              <img className="sbk-attachment__footer-icon" src={attachment.footer_icon} alt="" />
            )}
            {attachment.footer}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (color === "good") return "#2eb67d";
  if (color === "warning") return "#ecb22e";
  if (color === "danger") return "#e01e5a";
  return color.startsWith("#") ? color : `#${color}`;
}
