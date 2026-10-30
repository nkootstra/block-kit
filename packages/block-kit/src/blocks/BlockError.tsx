import { Component, type ReactNode } from "react";

/** Slack's unknown-block notice (`p-block_kit_unknown_block_error`), shown in place of a block. */
export function BlockError() {
  return (
    <div className="sbk-block-error">
      <small className="sbk-block-error__message">This content could not be displayed.</small>
    </div>
  );
}

interface BoundaryProps {
  /** The block being rendered: a new one (an edited payload) gets another try. */
  block: unknown;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
  /** The block the state is about. */
  block: unknown;
}

/**
 * Contains a block that throws while rendering (a payload missing a field the block needs, or a
 * custom block's bug) to that block: it shows Slack's unknown-block notice and the rest of the
 * message, and the host page, keep rendering. React still reports the error (`console.error`, or
 * `onCaughtError` on the root).
 */
export class BlockBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, block: this.props.block };

  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState) {
    return props.block === state.block ? null : { failed: false, block: props.block };
  }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? <BlockError /> : this.props.children;
  }
}
