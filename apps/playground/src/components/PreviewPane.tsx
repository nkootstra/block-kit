import {
  BlockKitProvider,
  type BlockKitProviderProps,
  HomeTab,
  Message,
  Modal,
  type ModalView,
  type Surface,
} from "@nkootstra/block-kit";
import { Tooltip } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { builderUrl } from "../payload";
import { toHomeView, toModalView } from "../lib/views";
import { color, font } from "../theme/tokens.stylex";
import { ButtonLink, layout, SegmentedControl } from "./ui";
import { sampleIdentity, sampleResolvers } from "../lib/workspace";

export type Delivery = "demo" | "app";

const TEAM_ID = import.meta.env.VITE_SLACK_TEAM_ID as string | undefined;

const SURFACES = [
  { value: "message", label: "Message" },
  { value: "modal", label: "Modal" },
  { value: "home", label: "Home tab" },
] as const satisfies readonly { value: Surface; label: string }[];

const PHONE = "@media (max-width: 800px)";

const styles = stylex.create({
  // On a phone the pane scrolls as one column (toolbar, preview, payload), so a long payload
  // never squeezes the preview away.
  pane: {
    display: "grid",
    gridTemplateRows: { default: "auto 1fr auto", [PHONE]: "auto auto auto" },
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
    minHeight: 0,
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
  field: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: color.muted,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  tooltip: {
    maxWidth: 280,
    paddingBlock: 6,
    paddingInline: 10,
    borderRadius: 8,
    backgroundColor: color.ink,
    color: color.bg,
    fontSize: 12,
    lineHeight: 1.45,
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
  if (__RELAY__ === "absent") return null;
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
    <Tooltip.Root>
      <Tooltip.Trigger render={<span />}>{picker}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup {...stylex.props(styles.tooltip)}>
            Set SLACK_REQUEST_URL and SLACK_SIGNING_SECRET in apps/playground/.env.local to deliver
            interactions to your app.
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

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
}: {
  source: string;
  surface: Surface;
  onSurfaceChange: (surface: Surface) => void;
  delivery: Delivery;
  onDeliveryChange: (delivery: Delivery) => void;
  /** The last payload that parsed. */
  shown: { blocks: ModalView["blocks"]; raw: unknown } | null;
  handlers: Omit<BlockKitProviderProps, "children">;
  log: ReactNode;
  hiddenOnPhone: boolean;
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
        <div {...stylex.props(styles.frame, surface === "modal" && styles.frameModal)}>
          {shown ? (
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
