import type { BlockKitProviderProps, ModalView, Surface } from "@nkootstra/block-kit";
import { httpTransport } from "@nkootstra/block-kit/transport";
import * as stylex from "@stylexjs/stylex";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { EditorPane } from "./components/EditorPane";
import { CUSTOM, ExamplePicker, pickerGroups } from "./components/ExamplePicker";
import { Header } from "./components/Header";
import { type AppReply, PayloadLog } from "./components/PayloadLog";
import { type Delivery, PreviewPane } from "./components/PreviewPane";
import { SegmentedControl } from "./components/ui";
import { demoAction, demoOptions, demoSubmit } from "./demoApp";
import { DEFAULT_EXAMPLE, examples } from "./examples";
import { detectSurface, isView } from "./lib/views";
import { parsePayload, readHash } from "./payload";
import { color, font } from "./theme/tokens.stylex";
import { useTheme } from "./theme/useTheme";

/** Where "Your app" sends interactions: the dev server's relay (vite.config.ts) signs them. */
const RELAY_URL = "/slack/relay";
const DELIVERY_KEY = "playground-delivery";

function readDelivery(): Delivery {
  // Only the dev server has the relay; anywhere else there's nothing to deliver to.
  if (__RELAY__ !== "ready") return "demo";
  try {
    return localStorage.getItem(DELIVERY_KEY) === "app" ? "app" : "demo";
  } catch {
    return "demo";
  }
}

type Fixture = { name: string; json: string };

/**
 * Every fixture, for the dev server's "Test fixtures" group. A production build ships only the
 * curated examples, so this never loads there.
 */
/** Every fixture the picker already offers by name, left out of the dev-only list. */
const OFFERED = new Set(examples.map((e) => e.name));

function useTestFixtures(): Fixture[] {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let live = true;
    void import("./fixtures").then((mod) => {
      if (live) setFixtures(mod.fixtures.filter((f) => !OFFERED.has(f.name)));
    });
    return () => {
      live = false;
    };
  }, []);
  return fixtures;
}

const PHONE = "@media (max-width: 800px)";

const styles = stylex.create({
  app: {
    display: "grid",
    gridTemplateRows: { default: "auto 1fr", [PHONE]: "auto auto 1fr" },
    height: "100%",
    backgroundColor: color.bg,
    color: color.ink,
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 1.5,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },
  main: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(340px, 1fr) minmax(400px, 1.25fr)",
      [PHONE]: "minmax(0, 1fr)",
    },
    minWidth: 0,
    minHeight: 0,
  },
  // Phones only: the example picker, which the editor's toolbar holds on wider screens, and the
  // JSON / Preview switch, so an example can be picked from either pane.
  phoneBar: {
    display: { default: "none", [PHONE]: "flex" },
    flexDirection: "column",
    gap: 8,
    marginTop: 10,
    marginInline: 16,
  },
});

export function App() {
  const [source, setSource] = useState(() => readHash() ?? DEFAULT_EXAMPLE?.json ?? "[]");
  const [surface, setSurface] = useState<Surface>(() => detectSurface(source));
  const [latestPayload, setLatestPayload] = useState<unknown>(null);
  const [delivery, setDelivery] = useState<Delivery>(readDelivery);
  const [appReply, setAppReply] = useState<AppReply | null>(null);
  // On a phone the editor and the preview take turns.
  const [pane, setPane] = useState<"editor" | "preview">("preview");
  const { choice, setChoice, resolved } = useTheme();
  const testFixtures = useTestFixtures();

  const deferred = useDeferredValue(source);
  const result = useMemo(() => parsePayload(deferred), [deferred]);
  const raw = useMemo(() => {
    try {
      return JSON.parse(deferred);
    } catch {
      return undefined;
    }
  }, [deferred]);
  // While the JSON is mid-edit and doesn't parse, keep showing the last version that did.
  const [shown, setShown] = useState<{ blocks: ModalView["blocks"]; raw: unknown } | null>(null);
  if (result.ok && shown?.blocks !== result.blocks) setShown({ blocks: result.blocks, raw });

  // Keep the URL shareable, in Block Kit Builder's hash format (a modal or Home tab keeps its view).
  useEffect(() => {
    if (!result.ok) return;
    const hash = encodeURIComponent(JSON.stringify(isView(raw) ? raw : { blocks: result.blocks }));
    window.history.replaceState(null, "", `#${hash}`);
  }, [result, raw]);

  useEffect(() => {
    if (__RELAY__ !== "ready") return;
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
      onResponse: (_, response) => setAppReply({ status: response.status, body: response.raw }),
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

  const all: Fixture[] = useMemo(() => [...examples, ...testFixtures], [testFixtures]);
  const groups = useMemo(
    () =>
      pickerGroups(
        examples,
        testFixtures.map((f) => f.name),
      ),
    [testFixtures],
  );
  const example = all.find((f) => f.json === source)?.name ?? CUSTOM;

  const load = (json: string) => {
    setSource(json);
    setSurface(detectSurface(json));
    setLatestPayload(null);
    setAppReply(null);
  };

  const pickExample = (name: string) => {
    const picked = all.find((f) => f.name === name);
    if (picked) load(picked.json);
  };

  return (
    <div {...stylex.props(styles.app)}>
      <Header theme={choice} onThemeChange={setChoice} />

      <div {...stylex.props(styles.phoneBar)}>
        <ExamplePicker groups={groups} value={example} onChange={pickExample} />
        <SegmentedControl
          label="View"
          value={pane}
          onChange={setPane}
          options={[
            { value: "editor", label: "JSON" },
            { value: "preview", label: "Preview" },
          ]}
          stretch
        />
      </div>

      <main {...stylex.props(styles.main)}>
        <EditorPane
          source={source}
          onSourceChange={setSource}
          error={result.ok ? null : result.error}
          groups={groups}
          example={example}
          onExampleChange={pickExample}
          theme={resolved}
          hiddenOnPhone={pane !== "editor"}
        />
        <PreviewPane
          source={source}
          surface={surface}
          onSurfaceChange={setSurface}
          delivery={delivery}
          onDeliveryChange={(next) => {
            setDelivery(next);
            setAppReply(null);
          }}
          shown={shown}
          handlers={handlers}
          hiddenOnPhone={pane !== "preview"}
          log={
            <PayloadLog
              payload={latestPayload}
              reply={appReply}
              delivering={delivery === "app"}
              onClear={() => {
                setLatestPayload(null);
                setAppReply(null);
              }}
              theme={resolved}
            />
          }
        />
      </main>
    </div>
  );
}
