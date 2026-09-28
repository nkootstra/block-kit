import type { ConfirmationDialog } from "@slack/types";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Wires up a confirm-before-acting flow for an element's `confirm` object. `ask()` resolves
 * `true` immediately when there is no `confirm` object; otherwise it opens the dialog and
 * resolves once the user picks confirm or deny. Render the returned `dialog` next to the
 * element so it can appear when open.
 */
export function useConfirm(confirm: ConfirmationDialog | undefined) {
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    if (!confirm) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }, [confirm]);

  const dialog =
    resolver && confirm ? (
      <ConfirmDialog
        confirm={confirm}
        onConfirm={() => {
          resolver(true);
          setResolver(null);
        }}
        onDeny={() => {
          resolver(false);
          setResolver(null);
        }}
      />
    ) : null;

  return { ask, dialog };
}
