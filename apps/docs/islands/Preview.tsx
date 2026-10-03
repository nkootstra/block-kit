import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "@fontsource/roboto-mono/400.css";
import "@nkootstra/block-kit/styles.css";
import "./preview.css";
import {
  type BlockAction,
  BlockKitProvider,
  type HomeTabView,
  Message,
  type ModalView,
  type OptionsResponse,
  type Resolvers,
  type SlackMessageLike,
  View,
} from "@nkootstra/block-kit";
import { Editor } from "@pierre/diffs/edit";
import { File as DiffsFile, type EditorFactory, EditProvider } from "@pierre/diffs/react";
import type { AnyBlock } from "@slack/types";
import { useId, useState, useSyncExternalStore } from "react";

export interface PreviewProps {
  /** What Block Kit Builder accepts: `{ blocks }`, a bare array of blocks, or a modal/home view. */
  payload: unknown;
  /** Show the payload first instead of the rendered result. */
  code?: boolean;
  /** Log `onAction` calls under the preview, so readers see what their handler would receive. */
  actions?: boolean;
  /** A modal to open, as `views.open` would, whenever a button in the preview is clicked. */
  opens?: unknown;
  /** Render the message as ephemeral ("Only visible to you"). */
  ephemeral?: boolean;
}

/**
 * A small sample workspace, so mentions and user/channel selects in examples show names. Docs
 * examples use these ids.
 */
const USERS: Record<string, string> = {
  U0ADA: "Ada Lovelace",
  U0GRACE: "Grace Hopper",
  U0ALAN: "Alan Turing",
};
const CHANNELS: Record<string, string> = {
  C0GENERAL: "general",
  C0RELEASES: "releases",
  C0DESIGN: "design",
};
const USERGROUPS: Record<string, string> = { S0ENG: "engineering" };

const resolvers: Resolvers = {
  user: (id) => USERS[id],
  channel: (id) => CHANNELS[id],
  usergroup: (id) => USERGROUPS[id],
};

/** Answers external selects from a fixed list of fruit, filtered by what's typed. */
const FRUIT = ["Apple", "Banana", "Cherry", "Grape", "Mango", "Orange", "Peach", "Pear"];
function onOptions({ value }: { value: string }): OptionsResponse {
  const query = value.toLowerCase();
  return {
    options: FRUIT.filter((name) => name.toLowerCase().includes(query)).map((name) => ({
      text: { type: "plain_text", text: name },
      value: name.toLowerCase(),
    })),
  };
}

/**
 * 2026-10-01 at midday UTC, so the server-rendered time matches the hydrated one. A recent date,
 * because search engines take the message's `<time dateTime>` as the page's date.
 */
const TS = 1_790_856_000;

export default function Preview({
  payload: original,
  code = false,
  actions = false,
  opens,
  ephemeral = false,
}: PreviewProps) {
  const [tab, setTab] = useState<"preview" | "json">(code ? "json" : "preview");
  const [last, setLast] = useState<{ action: BlockAction; count: number } | null>(null);
  const colorMode = useColorMode();
  const mounted = useMounted();
  const editKey = useId();
  const initial = JSON.stringify(original, null, 2);
  // What the JSON tab holds, and the last version of it that parsed: the preview renders that one,
  // so a half-typed edit never blanks it.
  const [source, setSource] = useState(initial);
  const [payload, setPayload] = useState(original);
  const [error, setError] = useState<string | null>(null);
  const edited = source !== initial;

  function edit(next: string) {
    setSource(next);
    try {
      setPayload(JSON.parse(next));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const view = asView(payload);
  const blocks = view ? undefined : asBlocks(payload);
  const message = view ? undefined : asMessage(payload);

  return (
    <div className="bkd-preview not-prose">
      <div className="bkd-preview__tabs" role="tablist">
        {(["preview", "json"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className="bkd-preview__tab"
            onClick={() => setTab(name)}
          >
            {name === "preview" ? "Preview" : "JSON"}
          </button>
        ))}
      </div>
      {tab === "preview" ? (
        <div className="bkd-preview__stage">
          <BlockKitProvider
            timeZone="UTC"
            surface={view?.type ?? "message"}
            resolvers={resolvers}
            onOptions={onOptions}
            onAction={(action, { views }) => {
              if (actions) setLast((prev) => ({ action, count: (prev?.count ?? 0) + 1 }));
              if (opens && action.type === "button") views.open(opens as ModalView);
            }}
          >
            {view ? (
              <View view={view} />
            ) : (
              <Message
                blocks={blocks}
                message={message}
                app={{ name: "Your App" }}
                ts={TS}
                timeZone="UTC"
                isEphemeral={ephemeral}
              />
            )}
          </BlockKitProvider>
        </div>
      ) : (
        <div className="bkd-preview__json">
          {mounted ? (
            <EditProvider createEditor={createEditor}>
              <DiffsFile
                file={{ name: "payload.json", contents: source }}
                edit
                editStateKey={editKey}
                onEditChange={(event) => edit(event.file.contents)}
                options={{
                  theme: CODE_THEME,
                  themeType: colorMode,
                  overflow: "scroll",
                  disableFileHeader: true,
                }}
              />
            </EditProvider>
          ) : (
            // Not a <pre>: Blume adds a copy button to every server-rendered <pre>, which would no
            // longer match on hydration.
            <div className="bkd-preview__json-placeholder">{source}</div>
          )}
          {(error || edited) && (
            <div className="bkd-preview__json-status">
              <span className={error ? "bkd-preview__json-error" : undefined}>
                {error
                  ? `Invalid JSON, the preview shows your last valid edit. ${error}`
                  : "Edited"}
              </span>
              <button
                type="button"
                className="bkd-preview__reset"
                onClick={() => {
                  setSource(initial);
                  setPayload(original);
                  setError(null);
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}
      {actions && tab === "preview" && (
        <div className="bkd-preview__log">
          <span className="bkd-preview__log-title">
            onAction
            {last && last.count > 1 && (
              <span className="bkd-preview__log-count"> · called {last.count} times, latest:</span>
            )}
          </span>
          {last ? (
            <DiffsFile
              file={{
                name: "action.json",
                contents: JSON.stringify(summarize(last.action), null, 2),
              }}
              options={{
                theme: CODE_THEME,
                themeType: colorMode,
                overflow: "wrap",
                disableFileHeader: true,
              }}
            />
          ) : (
            <span className="bkd-preview__log-empty">Interact with the preview.</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Diffs' editor, for the editable JSON tab. */
const createEditor: EditorFactory<undefined, undefined> = (type, options, editStateKey) =>
  new Editor(type, options, editStateKey);

/** Nothing to subscribe to: whether we're on the client never changes after hydration. */
const noSubscription = () => () => {};

/**
 * False on the server and while hydrating, so hydration matches the server's plain text before the
 * editor (which needs the DOM) takes over.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** Blume's own code themes, so the action reads like the page's other code blocks. */
const CODE_THEME = { light: "github-light", dark: "github-dark" } as const;

type ColorMode = "light" | "dark";

const readColorMode = (): ColorMode =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

function subscribeColorMode(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** The docs' light or dark mode, which Blume sets as `data-theme` on `<html>` and its toggle changes. */
function useColorMode(): ColorMode {
  return useSyncExternalStore(subscribeColorMode, readColorMode, () => "light");
}

/** The action without the ids and timestamp that change on every interaction. */
function summarize({ action_ts: _ts, block_id: _block, ...action }: BlockAction) {
  return action;
}

function asView(payload: unknown): (ModalView | HomeTabView) | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const type = (payload as { type?: unknown }).type;
  if (type !== "modal" && type !== "home") return undefined;
  return { id: "V00000000", ...(payload as object) } as ModalView | HomeTabView;
}

function asBlocks(payload: unknown): AnyBlock[] {
  if (Array.isArray(payload)) return payload as AnyBlock[];
  return ((payload as { blocks?: AnyBlock[] } | null)?.blocks ?? []) as AnyBlock[];
}

/** Message fields beyond `blocks` (attachments, reactions, a thread…) make the payload a whole message. */
const MESSAGE_KEYS = [
  "attachments",
  "reactions",
  "reply_count",
  "edited",
  "username",
  "bot_profile",
];
function asMessage(payload: unknown): SlackMessageLike | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  if (!MESSAGE_KEYS.some((key) => key in payload)) return undefined;
  return { ts: String(TS), ...(payload as SlackMessageLike) };
}
