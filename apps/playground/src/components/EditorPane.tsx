import * as stylex from "@stylexjs/stylex";
import { type KeyboardEvent, useRef } from "react";
import { LIMITS_URL } from "../lib/limits";
import { copyText, useFlash } from "../lib/useFlash";
import type { ParseResult } from "../payload";
import { color } from "../theme/tokens.stylex";
import { ExamplePicker, type PickerGroup } from "./ExamplePicker";
import { CodeEditor } from "./LazyCode";
import { Button, layout } from "./ui";

const PHONE = "@media (max-width: 800px)";
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

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
    // The editor draws no focus ring of its own; this one shows where the keyboard is.
    outline: { default: "none", ":focus-within": `2px solid ${color.accent}` },
    outlineOffset: -2,
  },
  hint: {
    flexShrink: 0,
    margin: 0,
    paddingBlock: 6,
    paddingInline: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
    color: color.muted,
    fontSize: 12,
  },
  kbd: {
    fontFamily: "inherit",
    paddingInline: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.lineStrong,
    borderRadius: 4,
  },
  warnings: {
    flexShrink: 0,
    margin: 0,
    paddingBlock: 10,
    paddingInline: 16,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
    backgroundColor: color.warnBg,
    color: color.warn,
    fontSize: 13,
  },
  warningList: {
    marginBlock: 4,
    marginInline: 0,
    paddingInlineStart: 20,
  },
  link: {
    color: "inherit",
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
  problem,
  warnings,
  groups,
  example,
  onExampleChange,
  theme,
  hiddenOnPhone,
}: {
  source: string;
  onSourceChange: (source: string) => void;
  /** Why the JSON isn't a payload the preview can draw, or null when it is. */
  problem: Extract<ParseResult, { ok: false }> | null;
  /** What Slack would refuse in a payload that previews fine. */
  warnings: string[];
  groups: PickerGroup[];
  example: string;
  onExampleChange: (name: string) => void;
  theme: "light" | "dark";
  hiddenOnPhone: boolean;
}) {
  const [flashed, flash] = useFlash();
  // CodeMirror's pattern: Tab indents, as in any editor, and Escape then Tab (or Shift+Tab) moves
  // focus out of it instead, so a keyboard user is never stuck in the editor.
  const escaped = useRef(false);
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key === "Tab" && escaped.current) {
      escaped.current = false;
      // Stops the editor from indenting; the browser then moves focus as it does anywhere else.
      event.stopPropagation();
      return;
    }
    // Shift on its way to Shift+Tab doesn't count as another key.
    if (MODIFIERS.has(event.key)) return;
    escaped.current = event.key === "Escape";
  };
  const parses = problem === null || problem.kind === "shape";

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
          <Button onClick={format} disabled={!parses}>
            Format
          </Button>
          <Button onClick={async () => (await copyText(source)) && flash("json")}>
            {flashed === "json" ? "Copied" : "Copy JSON"}
          </Button>
          <Button
            onClick={async () => (await copyText(window.location.href)) && flash("link")}
            disabled={problem !== null}
          >
            {flashed === "link" ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
      <div
        {...stylex.props(styles.code)}
        onKeyDownCapture={onKeyDownCapture}
        onBlur={() => {
          escaped.current = false;
        }}
      >
        <CodeEditor value={source} onChange={onSourceChange} theme={theme} />
      </div>
      <p {...stylex.props(styles.hint)}>
        <kbd {...stylex.props(styles.kbd)}>Tab</kbd> indents. Press{" "}
        <kbd {...stylex.props(styles.kbd)}>Esc</kbd> then{" "}
        <kbd {...stylex.props(styles.kbd)}>Tab</kbd> (or{" "}
        <kbd {...stylex.props(styles.kbd)}>Shift</kbd>+<kbd {...stylex.props(styles.kbd)}>Tab</kbd>)
        to leave the editor.
      </p>
      {problem !== null && (
        <p role="status" data-payload-error={problem.kind} {...stylex.props(styles.error)}>
          <strong>{problem.title}</strong> {problem.detail} The preview shows the last payload that
          worked.
        </p>
      )}
      {problem === null && warnings.length > 0 && (
        <div role="status" data-payload-warnings="" {...stylex.props(styles.warnings)}>
          <strong>Slack would refuse this payload.</strong> The preview still draws it.
          <ul {...stylex.props(styles.warningList)}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          See{" "}
          <a href={LIMITS_URL} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>
            Slack's limits
          </a>
          .
        </div>
      )}
    </section>
  );
}
