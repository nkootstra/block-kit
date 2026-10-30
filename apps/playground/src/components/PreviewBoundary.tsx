import type { AnyBlock } from "@slack/types";
import * as stylex from "@stylexjs/stylex";
import { Component, type ReactElement, type ReactNode } from "react";
import { color } from "../theme/tokens.stylex";

const styles = stylex.create({
  error: {
    margin: 0,
    padding: 16,
    borderRadius: 8,
    backgroundColor: color.dangerBg,
    color: color.danger,
    fontSize: 13,
    lineHeight: 1.5,
  },
  detail: {
    marginTop: 4,
    marginBottom: 0,
    color: color.ink,
    overflowWrap: "anywhere",
  },
});

/** Which part of the payload threw, found by rendering the parts one at a time. */
type Culprit = { kind: "view" } | { kind: "block"; index: number; type: string; message: string };

type Props = {
  /** The preview is retried whenever one of these changes: the next edit, or another surface. */
  resetKeys: unknown[];
  blocks: AnyBlock[];
  /** The same surface as `children`, holding only `blocks`; used to find the block that throws. */
  probe: (blocks: AnyBlock[]) => ReactElement;
  /** What else there is to blame when the surface fails with no blocks, e.g. "The modal's title". */
  outside: string;
  children: ReactNode;
};

type State = { error: Error | null; culprit: Culprit | null; resetKeys: unknown[] };

const messageOf = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/\.$/, "");

/**
 * Catches an error thrown while the preview renders, so a payload the package can't draw (valid
 * JSON with a block missing a required field, say) shows what's wrong instead of unmounting the
 * playground with the editor in it. The package may catch some of these itself; the playground
 * doesn't count on it.
 */
export class PreviewBoundary extends Component<Props, State> {
  override state: State = { error: null, culprit: null, resetKeys: this.props.resetKeys };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const changed =
      props.resetKeys.length !== state.resetKeys.length ||
      props.resetKeys.some((key, i) => !Object.is(key, state.resetKeys[i]));
    if (!changed) return null;
    return { error: null, culprit: null, resetKeys: props.resetKeys };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)), culprit: null };
  }

  override componentDidCatch() {
    const { blocks, probe } = this.props;
    // react-dom/server renders each part on its own, synchronously and without effects. It's
    // only needed once a payload fails, so it loads then.
    void import("react-dom/server").then(({ renderToString }) => {
      const fails = (element: ReactElement) => {
        try {
          renderToString(element);
          return undefined;
        } catch (err) {
          return messageOf(err);
        }
      };
      let culprit: Culprit | null = null;
      if (fails(probe([])) !== undefined) culprit = { kind: "view" };
      else {
        for (const [index, block] of blocks.entries()) {
          const message = fails(probe([block]));
          if (message !== undefined) {
            culprit = { kind: "block", index, type: String(block.type), message };
            break;
          }
        }
      }
      // Unless the payload changed meanwhile.
      if (this.state.error && this.props.blocks === blocks) this.setState({ culprit });
    });
  }

  override render() {
    const { error, culprit } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" data-preview-error="" {...stylex.props(styles.error)}>
        <strong>
          {culprit?.kind === "block"
            ? `blocks[${culprit.index}] (${culprit.type}) can't render.`
            : culprit?.kind === "view"
              ? `${this.props.outside} can't render.`
              : "This payload can't render."}
        </strong>
        <p {...stylex.props(styles.detail)}>
          {culprit?.kind === "block" ? culprit.message : messageOf(error)}. A required field is
          probably missing or has the wrong type. Edit the JSON and the preview tries again.
        </p>
      </div>
    );
  }
}
