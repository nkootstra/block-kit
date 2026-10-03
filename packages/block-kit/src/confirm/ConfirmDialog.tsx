import type { ConfirmationDialog } from "@slack/types";
import { createPortal } from "react-dom";
import { useBlockKit } from "../context";
import { Text } from "../Text";

export interface ConfirmDialogProps {
  confirm: ConfirmationDialog;
  onConfirm: () => void;
  onDeny: () => void;
}

/** Slack's confirmation dialog: blocks the triggering action until the user picks confirm/deny. */
export function ConfirmDialog({ confirm, onConfirm, onDeny }: ConfirmDialogProps) {
  const { theme } = useBlockKit();
  const confirmStyle = confirm.style ?? "primary";
  const node = (
    <div className="sbk-confirm__overlay" role="presentation" data-theme={theme} onClick={onDeny}>
      <div
        className="sbk-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={confirm.title?.text}
        // Stop the overlay's onClick (dismiss) from firing for clicks inside the dialog.
        onClick={(event) => event.stopPropagation()}
      >
        {confirm.title && <h2 className="sbk-confirm__title">{confirm.title.text}</h2>}
        <div className="sbk-confirm__text">
          <Text text={confirm.text} />
        </div>
        <div className="sbk-confirm__actions">
          <button
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
