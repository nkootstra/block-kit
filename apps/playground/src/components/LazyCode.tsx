import * as stylex from "@stylexjs/stylex";
import { type ComponentProps, lazy, Suspense } from "react";
import { color, font } from "../theme/tokens.stylex";

const Code = import("./Code");
const LazyEditor = lazy(() => Code.then((m) => ({ default: m.CodeEditor })));
const LazyViewer = lazy(() => Code.then((m) => ({ default: m.CodeViewer })));

const styles = stylex.create({
  // What shows for the moment before the editor loads: the same JSON, unhighlighted.
  fallback: {
    margin: 0,
    paddingBlock: 8,
    paddingInline: 16,
    color: color.ink,
    fontFamily: font.mono,
    fontSize: 13,
    lineHeight: "20px",
    whiteSpace: "pre",
  },
});

export function CodeEditor(props: ComponentProps<typeof LazyEditor>) {
  return (
    <Suspense fallback={<pre {...stylex.props(styles.fallback)}>{props.value}</pre>}>
      <LazyEditor {...props} />
    </Suspense>
  );
}

export function CodeViewer(props: ComponentProps<typeof LazyViewer>) {
  return (
    <Suspense fallback={<pre {...stylex.props(styles.fallback)}>{props.value}</pre>}>
      <LazyViewer {...props} />
    </Suspense>
  );
}
