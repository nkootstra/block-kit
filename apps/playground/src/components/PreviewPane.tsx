import {
  BlockKitProvider,
  type BlockKitProviderProps,
  HomeTab,
  Message,
  Modal,
  type ModalView,
  type Surface,
} from "@nkootstra/block-kit";
import * as stylex from "@stylexjs/stylex";
import { Component, type ErrorInfo, lazy, memo, type ReactNode, Suspense } from "react";
import { builderUrl } from "../payload";
import { toHomeView, toModalView } from "../lib/views";
import { color, font } from "../theme/tokens.stylex";
import { ButtonLink, layout, SegmentedControl } from "./ui";
import { sampleIdentity, sampleResolvers } from "../lib/workspace";

export type Delivery = "demo" | "app";

// A build has no relay (`__RELAY__` is "absent"), so the import folds away and the chunk isn't
// emitted.
const RelayHint =
  __RELAY__ === "absent"
    ? null
    : lazy(() => import("./RelayHint").then((m) => ({ default: m.RelayHint })));

const TEAM_ID = import.meta.env.VITE_SLACK_TEAM_ID as string | undefined;

const SURFACES = [
  { value: "message", label: "Message" },
  { value: "modal", label: "Modal" },
  { value: "home", label: "Home tab" },
] as const satisfies readonly { value: Surface; label: string }[];

const PHONE = "@media (max-width: 800px)";

const styles = stylex.create({
  // On a phone the pane scrolls as one column (toolbar, preview, payload), so a long payload
  // never squeezes the preview away. Its rows are `max-content`, not `auto`: the pane has a
  // fixed height, and `auto` rows shrink to share it, which let a long preview paint over the
  // payload below it. The column is pinned to the pane's width: as an `auto` column it grew to
  // fit a wide block (a carousel), pushing the preview and toolbar off the side of a phone.
  pane: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: {
      default: "auto 1fr auto",
      [PHONE]: "max-content max-content max-content",
    },
    alignContent: "start",
    minWidth: 0,
    minHeight: 0,
    overflowY: { default: "visible", [PHONE]: "auto" },
    backgroundColor: color.well,
  },
  hidden: {
    display: { default: "grid", [PHONE]: "none" },
  },
  toolbar: {
    backgroundColor: color.bg,
  },
  // The room around the preview: the message, modal or Home tab sits in a frame on a well, as
  // the docs show it, rather than against the editor.
  stage: {
    minHeight: { default: 0, [PHONE]: "auto" },
    overflow: { default: "auto", [PHONE]: "visible" },
    padding: { default: 32, [PHONE]: 16 },
  },
  // The docs' preview: a 1px border, an 8px radius and 16px of room on every side.
  frame: {
    maxWidth: 760,
    marginInline: "auto",
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: 8,
    backgroundColor: color.frameBg,
    boxShadow: color.shadow,
  },
  // A modal is its own card in Slack: it gets the room around it but no second frame.
  frameModal: {
    maxWidth: "none",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  empty: {
    margin: 0,
    padding: 24,
    color: color.muted,
    textAlign: "center",
  },
  code: {
    fontFamily: font.mono,
  },
  // Above the frame, at its width, so it reads as part of the preview rather than of the page.
  sharedNote: {
    maxWidth: 760,
    marginTop: 0,
    marginBottom: 12,
    marginInline: "auto",
    color: color.muted,
    fontSize: 13,
    textWrap: "pretty",
  },
  field: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: color.muted,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
});

/**
 * Where interactions go. The relay only exists in the dev server (`__RELAY__`, set in
 * vite.config.ts): a built playground never offers it, and the dev server offers it once it's
 * configured, explaining what's missing until then.
 */
function DeliveryPicker({
  value,
  onChange,
}: {
  value: Delivery;
  onChange: (value: Delivery) => void;
}) {
  if (__RELAY__ === "absent" || !RelayHint) return null;
  const picker = (
    <span {...stylex.props(styles.field)}>
      Deliver to
      <SegmentedControl
        label="Deliver interactions to"
        value={value}
        onChange={onChange}
        options={[
          { value: "demo", label: "Demo" },
          { value: "app", label: "Your app", disabled: __RELAY__ !== "ready" },
        ]}
      />
    </span>
  );
  if (__RELAY__ === "ready") return picker;
  return (
    <Suspense fallback={picker}>
      <RelayHint>{picker}</RelayHint>
    </Suspense>
  );
}

type Shown = { blocks: ModalView["blocks"]; raw: unknown };

/**
 * Keeps a payload that throws while it renders inside the preview, so the rest of the playground
 * stays up and the JSON can be fixed. The next payload (or surface) tries again.
 */
type BoundaryProps = { shown: Shown; surface: Surface; children: ReactNode };

export class PreviewBoundary extends Component<
  BoundaryProps,
  { failed: boolean; shown: Shown; surface: Surface }
> {
  override state = { failed: false, shown: this.props.shown, surface: this.props.surface };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // A new payload or surface clears the failure, so it renders again.
  static getDerivedStateFromProps(props: BoundaryProps, state: { shown: Shown; surface: Surface }) {
    if (props.shown === state.shown && props.surface === state.surface) return null;
    return { failed: false, shown: props.shown, surface: props.surface };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("The preview couldn't render this payload.", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p role="alert" {...stylex.props(styles.empty)}>
        This payload couldn't be rendered. Edit the JSON or pick an example.
      </p>
    );
  }
}

/**
 * The payload as Slack draws it. Memoized: the pane re-renders on every keystroke (for the Block
 * Kit Builder link), and the surface only needs to when the payload that parses changes.
 */
const Rendered = memo(function Rendered({
  shown,
  surface,
  handlers,
}: {
  shown: Shown;
  surface: Surface;
  handlers: Omit<BlockKitProviderProps, "children">;
}) {
  return (
    <BlockKitProvider
      surface={surface}
      resolvers={sampleResolvers}
      identity={sampleIdentity}
      {...handlers}
    >
      {surface === "modal" ? (
        <Modal view={toModalView(shown.raw, shown.blocks)} />
      ) : surface === "home" ? (
        <HomeTab view={toHomeView(shown.raw, shown.blocks)} />
      ) : (
        <Message blocks={shown.blocks} />
      )}
    </BlockKitProvider>
  );
});

export function PreviewPane({
  source,
  surface,
  onSurfaceChange,
  delivery,
  onDeliveryChange,
  shown,
  handlers,
  log,
  hiddenOnPhone,
  shared = false,
}: {
  source: string;
  surface: Surface;
  onSurfaceChange: (surface: Surface) => void;
  delivery: Delivery;
  onDeliveryChange: (delivery: Delivery) => void;
  /** The last payload that parsed. */
  shown: Shown | null;
  handlers: Omit<BlockKitProviderProps, "children">;
  log: ReactNode;
  hiddenOnPhone: boolean;
  /** The payload came from the link's hash, so someone else wrote it. */
  shared?: boolean;
}) {
  return (
    <section aria-label="Preview" {...stylex.props(styles.pane, hiddenOnPhone && styles.hidden)}>
      <div {...stylex.props(layout.toolbar, styles.toolbar)}>
        <SegmentedControl
          label="Surface"
          value={surface}
          onChange={onSurfaceChange}
          options={SURFACES}
        />
        <div {...stylex.props(layout.actions)}>
          <DeliveryPicker value={delivery} onChange={onDeliveryChange} />
          <ButtonLink href={builderUrl(source, TEAM_ID)} target="_blank" rel="noreferrer">
            Open in Block Kit Builder
            <span aria-hidden="true">↗</span>
          </ButtonLink>
        </div>
      </div>

      <div {...stylex.props(styles.stage)}>
        {shared && (
          <p role="note" {...stylex.props(styles.sharedNote)}>
            This is a preview of a shared payload. Its links and buttons lead to sites chosen by
            whoever made the link.
          </p>
        )}
        <div {...stylex.props(styles.frame, surface === "modal" && styles.frameModal)}>
          {shown ? (
            <PreviewBoundary shown={shown} surface={surface}>
              <Rendered shown={shown} surface={surface} handlers={handlers} />
            </PreviewBoundary>
          ) : (
            <p {...stylex.props(styles.empty)}>
              Paste a <code {...stylex.props(styles.code)}>{'{ "blocks": [...] }'}</code> payload,
              or pick an example.
            </p>
          )}
        </div>
      </div>

      {log}
    </section>
  );
}
