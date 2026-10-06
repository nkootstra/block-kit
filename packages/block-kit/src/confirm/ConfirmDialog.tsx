import type { ConfirmationDialog } from "@slack/types";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "../context";
import { CloseIcon } from "../icons";
import { Text } from "../Text";

export interface ConfirmDialogProps {
  confirm: ConfirmationDialog;
  onConfirm: () => void;
  onDeny: () => void;
}

/**
 * Slack's confirmation dialog (`c-dialog`): blocks the triggering action until the user confirms or
 * denies. Escape, the close button and a click on the overlay all deny.
 *
 * Slack marks it `role="dialog"`; this keeps `alertdialog`, the role WAI-ARIA gives a dialog that
 * interrupts to ask for a confirmation, so screen readers announce its text on open. Focus starts
 * on the deny button, the least destructive choice, stays inside while it's open, and goes back to
 * whatever opened it when it closes.
 */
export function ConfirmDialog({ confirm, onConfirm, onDeny }: ConfirmDialogProps) {
  const { theme } = useBlockKit();
  const confirmStyle = confirm.style ?? "primary";
  const titleId = useId();
  const textId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const denyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    denyRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDeny();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = [...(dialogRef.current?.querySelectorAll("button") ?? [])];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  const node = (
    <div className="sbk-confirm__overlay" role="presentation" data-theme={theme} onClick={onDeny}>
      {/* A modal dialog handles its own keys: Escape denies and Tab stays inside it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        className="sbk-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={confirm.title ? titleId : undefined}
        aria-label={confirm.title ? undefined : (confirm.confirm?.text ?? "Confirm")}
        aria-describedby={textId}
        onKeyDown={onKeyDown}
        // Stop the overlay's onClick (dismiss) from firing for clicks inside the dialog.
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sbk-confirm__header">
          {confirm.title && (
            <h2 id={titleId} className="sbk-confirm__title">
              {confirm.title.text}
            </h2>
          )}
          <button type="button" className="sbk-confirm__close" aria-label="Close" onClick={onDeny}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>
        <div id={textId} className="sbk-confirm__text">
          <Text text={confirm.text} />
        </div>
        <div className="sbk-confirm__actions">
          <button
            ref={denyRef}
            type="button"
            className="sbk-confirm__button sbk-confirm__button--deny"
            onClick={onDeny}
          >
            {confirm.deny?.text ?? "Cancel"}
          </button>
          <button
            type="button"
            className={`sbk-confirm__button sbk-confirm__button--${confirmStyle}`}
            onClick={onConfirm}
          >
            {confirm.confirm?.text ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
  // Portal to <body> so the dialog stacks above the message surface; falls back to inline
  // rendering when `document` isn't available (e.g. non-DOM test renderers).
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
