import { Editor } from "@pierre/diffs/edit";
import { File as DiffsFile, type EditorFactory, EditProvider } from "@pierre/diffs/react";
import { httpTransport } from "@nkootstra/block-kit/transport";
import {
  BlockKitProvider,
  type BlockKitProviderProps,
  HomeTab,
  type HomeTabView,
  Message,
  Modal,
  type ModalView,
  type Surface,
} from "@nkootstra/block-kit";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { demoAction, demoOptions, demoSubmit } from "./demoApp";
import { fixtures } from "./fixtures";
import { builderUrl, parsePayload, readHash } from "./payload";

const TEAM_ID = import.meta.env.VITE_SLACK_TEAM_ID as string | undefined;
const DEFAULT_FIXTURE = fixtures.find((f) => f.name === "message/approval") ?? fixtures[0];

const SURFACES: Surface[] = ["message", "modal", "home"];

/**
 * Where interactions go: the built-in demo handlers, or your app through the dev server's relay
 * (`vite.config.ts`), which signs them with your signing secret.
 */
type Delivery = "demo" | "app";
const RELAY_URL = "/slack/relay";
const DELIVERY_KEY = "playground-delivery";

function readDelivery(): Delivery {
  try {
    return localStorage.getItem(DELIVERY_KEY) === "app" ? "app" : "demo";
  } catch {
    return "demo";
  }
}

/** Your app's reply to the latest interaction, when delivering to it. */
type AppReply = { status?: number; body?: unknown; error?: string };

/** Pierre's own themes (as on diffs.com). Forced light: the playground and its Slack preview are light-only. */
const DIFFS_THEME = { light: "pierre-light", dark: "pierre-dark" } as const;

/** Combines shared defaults with the per-surface options `EditProvider` requests. */
const createEditor: EditorFactory<undefined, undefined> = (type, options, editStateKey) =>
  new Editor(type, options, editStateKey);

/** A fixture's own `"type"` field, when it's a raw modal/home view rather than a blocks array. */
function detectSurface(json: string): Surface {
  try {
    const value = JSON.parse(json);
    if (value && typeof value === "object" && "type" in value) {
      const type = (value as { type: unknown }).type;
      if (type === "modal" || type === "home") return type;
    }
  } catch {
    // Fall through to the default below; the editor/error panel surfaces the parse error.
  }
  return "message";
}

/** Fills in the title/close/submit Slack requires for a modal, so any blocks array previews. */
function toModalView(raw: unknown, blocks: ModalView["blocks"]): ModalView {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: "V00000000",
    type: "modal",
    blocks,
    callback_id: typeof obj.callback_id === "string" ? obj.callback_id : undefined,
    private_metadata: typeof obj.private_metadata === "string" ? obj.private_metadata : undefined,
    title: (obj.title as ModalView["title"]) ?? { type: "plain_text", text: "Preview" },
    close: (obj.close as ModalView["close"]) ?? { type: "plain_text", text: "Cancel" },
    submit: (obj.submit as ModalView["submit"]) ?? { type: "plain_text", text: "Submit" },
  };
}

function toHomeView(raw: unknown, blocks: HomeTabView["blocks"]): HomeTabView {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: "V00000000",
    type: "home",
    blocks,
    callback_id: typeof obj.callback_id === "string" ? obj.callback_id : undefined,
    private_metadata: typeof obj.private_metadata === "string" ? obj.private_metadata : undefined,
  };
}

function isOk(reply: AppReply): boolean {
  return reply.status !== undefined && reply.status >= 200 && reply.status < 300;
}

function describeBody(body: unknown): string {
  if (body === undefined) return "(empty ack)";
  return typeof body === "string" ? body : JSON.stringify(body, null, 2);
}

export function App() {
  const [source, setSource] = useState(() => readHash() ?? DEFAULT_FIXTURE?.json ?? "[]");
  const [surface, setSurface] = useState<Surface>(() => detectSurface(source));
  const [latestPayload, setLatestPayload] = useState<unknown>(null);
  const [delivery, setDelivery] = useState<Delivery>(readDelivery);
  const [appReply, setAppReply] = useState<AppReply | null>(null);
  const deferred = useDeferredValue(source);
  const result = useMemo(() => parsePayload(deferred), [deferred]);
  const raw = useMemo(() => {
    try {
      return JSON.parse(deferred);
    } catch {
      return undefined;
    }
  }, [deferred]);

  // Keep the URL shareable, in Block Kit Builder's hash format.
  useEffect(() => {
    if (!result.ok) return;
    const hash = encodeURIComponent(
      JSON.stringify(result.blocks.length ? { blocks: result.blocks } : { blocks: [] }),
    );
    window.history.replaceState(null, "", `#${hash}`);
  }, [result]);

  useEffect(() => {
    try {
      localStorage.setItem(DELIVERY_KEY, delivery);
    } catch {
      // Remembering the choice is a convenience; without storage it resets on reload.
    }
  }, [delivery]);

  const handlers = useMemo((): Omit<BlockKitProviderProps, "children"> => {
    const record = (payload: unknown) => {
      setLatestPayload(payload);
      setAppReply(null);
    };
    if (delivery === "demo") {
      return {
        onAction: demoAction,
        onPayload: record,
        onSubmit: (payload) => {
          record(payload);
          return demoSubmit(payload);
        },
        onClose: record,
        onOptions: (payload) => {
          record(payload);
          return demoOptions(payload);
        },
      };
    }
    const transport = httpTransport({
      url: RELAY_URL,
      onResponse: (_, result) => setAppReply({ status: result.status, body: result.raw }),
      onError: (_, error) => {
        if (!error.result) setAppReply({ error: error.message });
      },
    });
    return {
      onPayload: (payload, context) => {
        record(payload);
        transport.onPayload(payload, context);
      },
      onSubmit: (payload, context) => {
        record(payload);
        return transport.onSubmit(payload, context);
      },
      onClose: (payload) => {
        record(payload);
        transport.onClose(payload);
      },
      onOptions: (payload) => {
        record(payload);
        return transport.onOptions(payload);
      },
    };
  }, [delivery]);

  const activeFixture = fixtures.find((f) => f.json === source)?.name ?? "";

  return (
    <div className="pg">
      <header className="pg-header">
        <h1 className="pg-title">Block Kit Playground</h1>
        <select
          className="pg-select"
          value={activeFixture}
          onChange={(e) => {
            const fixture = fixtures.find((f) => f.name === e.target.value);
            if (fixture) {
              setSource(fixture.json);
              setSurface(detectSurface(fixture.json));
            }
          }}
        >
          <option value="" disabled>
            Custom payload
          </option>
          {fixtures.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="pg-surfaces" role="tablist" aria-label="Surface">
          {SURFACES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={surface === s}
              className="pg-surfaces__tab"
              onClick={() => setSurface(s)}
            >
              {s === "message" ? "Message" : s === "modal" ? "Modal" : "Home"}
            </button>
          ))}
        </div>
        <label className="pg-delivery">
          Deliver to
          <select
            className="pg-select"
            value={delivery}
            onChange={(e) => {
              setDelivery(e.target.value as Delivery);
              setAppReply(null);
            }}
          >
            <option value="demo">Demo handlers</option>
            <option value="app">Your app (via {RELAY_URL})</option>
          </select>
        </label>
        <a className="pg-link" href={builderUrl(source, TEAM_ID)} target="_blank" rel="noreferrer">
          Compare in Block Kit Builder ↗
        </a>
      </header>

      <main className="pg-main">
        <section className="pg-editor" aria-label="Payload">
          <EditProvider createEditor={createEditor}>
            <DiffsFile
              file={{ name: "payload.json", contents: source }}
              edit
              editStateKey="playground-source"
              onEditChange={(event) => setSource(event.file.contents)}
              options={{
                theme: DIFFS_THEME,
                themeType: "light",
                overflow: "scroll",
                disableFileHeader: true,
              }}
            />
          </EditProvider>
        </section>

        <section className="pg-preview" aria-label="Preview">
          <div className="pg-channel" data-surface={surface}>
            {result.ok ? (
              <BlockKitProvider surface={surface} {...handlers}>
                {surface === "modal" ? (
                  <Modal view={toModalView(raw, result.blocks)} />
                ) : surface === "home" ? (
                  <HomeTab view={toHomeView(raw, result.blocks)} />
                ) : (
                  <Message blocks={result.blocks} />
                )}
              </BlockKitProvider>
            ) : (
              <p className="pg-error">{result.error}</p>
            )}
          </div>

          <div className="pg-log">
            <div className="pg-log__header">
              <h2>Payload</h2>
              {latestPayload !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setLatestPayload(null);
                    setAppReply(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {appReply && (
              <div className="pg-reply" data-ok={isOk(appReply)}>
                <strong>
                  {appReply.error
                    ? "Not delivered"
                    : isOk(appReply)
                      ? `Your app answered ${appReply.status}`
                      : `Delivery failed (${appReply.status})`}
                </strong>
                <pre>{appReply.error ?? describeBody(appReply.body)}</pre>
              </div>
            )}
            {latestPayload === null ? (
              <p className="pg-log__empty">
                Interact with the preview (click a button, search an external select, submit, or
                close a modal) to see the Slack interaction payload it would send.
                {delivery === "app" && ` It's delivered to your app, and its reply shows here.`}
              </p>
            ) : (
              <DiffsFile
                file={{ name: "payload.json", contents: JSON.stringify(latestPayload, null, 2) }}
                options={{
                  theme: DIFFS_THEME,
                  themeType: "light",
                  overflow: "wrap",
                  disableFileHeader: true,
                }}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
