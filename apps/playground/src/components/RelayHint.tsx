import { Tooltip } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color } from "../theme/tokens.stylex";

const styles = stylex.create({
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
 * Explains why "Your app" is disabled while the dev server's relay isn't configured. Only the dev
 * server can show it (`__RELAY__`), so `PreviewPane` loads it lazily and a build never ships it.
 */
export function RelayHint({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={<span />}>{children}</Tooltip.Trigger>
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
