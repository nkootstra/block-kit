import * as stylex from "@stylexjs/stylex";
import { copyText, useFlash } from "../lib/useFlash";
import { color } from "../theme/tokens.stylex";
import { ExamplePicker, type PickerGroup } from "./ExamplePicker";
import { CodeEditor } from "./LazyCode";
import { Button, layout } from "./ui";

const PHONE = "@media (max-width: 800px)";

const styles = stylex.create({
  pane: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    borderRightWidth: { default: 1, [PHONE]: 0 },
    borderRightStyle: "solid",
    borderRightColor: color.line,
  },
  hidden: {
    display: { default: "flex", [PHONE]: "none" },
  },
  picker: {
    display: { default: "flex", [PHONE]: "none" },
  },
  code: {
    flexGrow: 1,
    minHeight: 0,
    overflow: "auto",
    fontSize: 13,
  },
  error: {
    flexShrink: 0,
    margin: 0,
    paddingBlock: 10,
    paddingInline: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
    backgroundColor: color.dangerBg,
    color: color.danger,
    fontSize: 13,
  },
});

export function EditorPane({
  source,
  onSourceChange,
  error,
  groups,
  example,
  onExampleChange,
  theme,
  hiddenOnPhone,
}: {
  source: string;
  onSourceChange: (source: string) => void;
  /** Why the JSON doesn't parse, or null when it does. */
  error: string | null;
  groups: PickerGroup[];
  example: string;
  onExampleChange: (name: string) => void;
  theme: "light" | "dark";
  hiddenOnPhone: boolean;
}) {
  const [flashed, flash] = useFlash();

  const format = () => {
    try {
      onSourceChange(JSON.stringify(JSON.parse(source), null, 2));
    } catch {
      // The error bar already says why it doesn't parse.
    }
  };

  return (
    <section
      aria-label="Payload JSON"
      {...stylex.props(styles.pane, hiddenOnPhone && styles.hidden)}
    >
      <div {...stylex.props(layout.toolbar)}>
        {/* On a phone the picker sits above the JSON / Preview switch instead (App.tsx). */}
        <div {...stylex.props(styles.picker)}>
          <ExamplePicker groups={groups} value={example} onChange={onExampleChange} />
        </div>
        <div {...stylex.props(layout.actions)}>
          <Button onClick={format} disabled={error !== null}>
            Format
          </Button>
          <Button onClick={async () => (await copyText(source)) && flash("json")}>
            {flashed === "json" ? "Copied" : "Copy JSON"}
          </Button>
          <Button
            onClick={async () => (await copyText(window.location.href)) && flash("link")}
            disabled={error !== null}
          >
            {flashed === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
      <div {...stylex.props(styles.code)}>
        <CodeEditor value={source} onChange={onSourceChange} theme={theme} />
      </div>
      {error !== null && (
        <p role="status" {...stylex.props(styles.error)}>
          <strong>This JSON doesn't parse.</strong> {error}. The preview shows the last version that
          did.
        </p>
      )}
    </section>
  );
}
