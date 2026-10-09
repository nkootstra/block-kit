import * as stylex from "@stylexjs/stylex";
import { copyText, useFlash } from "../lib/useFlash";
import { color, font } from "../theme/tokens.stylex";
import { CodeViewer } from "./LazyCode";
import { Button, layout } from "./ui";

/** Your app's reply to the latest interaction, when delivering to it. */
export type AppReply = { status?: number; body?: unknown; error?: string };

function isOk(reply: AppReply): boolean {
  return reply.status !== undefined && reply.status >= 200 && reply.status < 300;
}

function describeBody(body: unknown): string {
  if (body === undefined) return "(empty ack)";
  return typeof body === "string" ? body : JSON.stringify(body, null, 2);
}

const PHONE = "@media (max-width: 800px)";

const styles = stylex.create({
  log: {
    display: "flex",
    flexDirection: "column",
    minHeight: 160,
    maxHeight: { default: "40vh", [PHONE]: "none" },
    overflow: "auto",
    paddingBlock: 12,
    paddingInline: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
    backgroundColor: color.bg,
    fontSize: 13,
  },
  header: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
  },
  heading: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
  },
  empty: {
    marginTop: 4,
    marginBottom: 0,
    color: color.muted,
    textWrap: "pretty",
  },
  // The Pierre Diffs `File` (read-only payload viewer) needs real height to grow into, or its
  // virtualized content collapses to the height of its initially empty shadow DOM.
  viewer: {
    display: "block",
    flexGrow: 1,
    minHeight: 0,
    marginTop: 8,
    fontSize: 12,
  },
  reply: {
    flexShrink: 0,
    marginTop: 8,
    paddingBlock: 8,
    paddingInline: 12,
    borderRadius: 8,
    backgroundColor: color.accentWash,
    color: color.ink,
  },
  replyFailed: {
    backgroundColor: color.dangerBg,
    color: color.danger,
  },
  replyBody: {
    marginTop: 4,
    marginBottom: 0,
    fontFamily: font.mono,
    fontSize: 12,
    whiteSpace: "pre-wrap",
  },
});

export function PayloadLog({
  payload,
  reply,
  delivering,
  onClear,
  theme,
}: {
  payload: unknown;
  reply: AppReply | null;
  /** Whether interactions go to your app rather than the demo handlers. */
  delivering: boolean;
  onClear: () => void;
  theme: "light" | "dark";
}) {
  const [flashed, flash] = useFlash();
  const json = payload === null ? null : JSON.stringify(payload, null, 2);

  return (
    <div {...stylex.props(styles.log)}>
      <div {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.heading)}>Payload</h2>
        {json !== null && (
          <div {...stylex.props(layout.actions)}>
            <Button onClick={async () => (await copyText(json)) && flash("payload")}>
              {flashed === "payload" ? "Copied" : "Copy"}
            </Button>
            <Button onClick={onClear}>Clear</Button>
          </div>
        )}
      </div>
      {reply && (
        <div {...stylex.props(styles.reply, !isOk(reply) && styles.replyFailed)}>
          <strong>
            {reply.error
              ? "Not delivered"
              : isOk(reply)
                ? `Your app answered ${reply.status}`
                : `Delivery failed (${reply.status})`}
          </strong>
          <pre {...stylex.props(styles.replyBody)}>{reply.error ?? describeBody(reply.body)}</pre>
        </div>
      )}
      {json === null ? (
        <p {...stylex.props(styles.empty)}>
          Click a button, pick an option or submit the modal to see the payload Slack would send
          your app.
          {delivering && " It's delivered to your app, and its reply shows here."}
        </p>
      ) : (
        <CodeViewer value={json} theme={theme} {...stylex.props(styles.viewer)} />
      )}
    </div>
  );
}
