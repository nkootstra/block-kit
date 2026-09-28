import type { ReactNode } from "react";
import { Text, type TextObject } from "../Text";
import type { BlockProps, Json } from "../types";

type AlertLevel = "default" | "info" | "warning" | "error" | "success";

const LEVELS = new Set<AlertLevel>(["default", "info", "warning", "error", "success"]);

// Icons copied from the Builder's `c-alert__icon` (20×20, `currentColor`).
const WARNING_TRIANGLE = (
  <>
    <path d="M10 12.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2m0-6a.75.75 0 0 1 .75.75V11a.75.75 0 0 1-1.5 0V7.5a.75.75 0 0 1 .75-.75" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.712 3.542c1.02-1.723 3.556-1.723 4.576 0l6.1 10.303c1.043 1.761-.28 3.905-2.287 3.905H3.899c-2.007 0-3.33-2.144-2.288-3.905zm3.285.765c-.44-.742-1.554-.742-1.994 0l-6.1 10.302c-.418.704.084 1.641.996 1.641h12.202c.912 0 1.414-.937.997-1.642z"
    />
  </>
);

const ICONS: Record<AlertLevel, ReactNode> = {
  default: (
    <path d="M9.52 4.8V2.9q0-.51-.26-.95a1.8 1.8 0 0 0-.69-.69A1.8 1.8 0 0 0 7.62 1q-.51 0-.95.26a2 2 0 0 0-.69.7q-.25.43-.25.94 0 .52.25.96.26.43.69.69.44.25.95.25zm2.85 4.73a1.9 1.9 0 0 1-.96-.25 2 2 0 0 1-.69-.69 1.9 1.9 0 0 1-.25-.96V2.9q0-.51.25-.95.26-.44.69-.69.44-.26.96-.26.51 0 .94.26.43.25.68.69.26.44.26.95v4.73q0 .52-.26.96a1.84 1.84 0 0 1-1.62.94M9.53 7.62q0 .52-.26.96a1.9 1.9 0 0 1-.69.69q-.43.25-.95.25H2.9q-.51 0-.95-.25a2 2 0 0 1-.7-.69A1.9 1.9 0 0 1 1 7.62q0-.51.26-.94.26-.44.69-.69.44-.26.95-.26h4.73q.52 0 .95.26.44.25.69.69.26.43.26.94m5.67 1.9h1.9q.51 0 .95-.25.44-.26.69-.69.26-.44.26-.96 0-.51-.26-.94a1.9 1.9 0 0 0-.7-.69q-.43-.26-.94-.26-.52 0-.96.26a1.9 1.9 0 0 0-.69.69q-.25.43-.25.94zM2.9 14.25a1.9 1.9 0 0 1-.95-.25 2 2 0 0 1-.7-.69Q1 12.88 1 12.37a1.86 1.86 0 0 1 .95-1.64q.44-.26.95-.26h1.9v1.9q0 .51-.26.94a1.9 1.9 0 0 1-.69.69q-.43.25-.95.25m4.72-3.78q.52 0 .95.26.44.25.69.69.26.43.26.95v4.73q0 .51-.26.95a1.8 1.8 0 0 1-.69.69q-.43.26-.95.26-.51 0-.95-.26a2 2 0 0 1-.69-.7q-.25-.43-.25-.94v-4.73q0-.52.25-.95.26-.44.69-.69.44-.26.95-.26m2.85 1.9q0-.52.25-.95.26-.44.69-.69.44-.26.96-.26h4.73q.51 0 .95.26.44.25.69.69.26.43.26.95 0 .51-.26.94a1.9 1.9 0 0 1-.69.69 1.9 1.9 0 0 1-.95.25h-4.73a1.9 1.9 0 0 1-.96-.25 2 2 0 0 1-.69-.69q-.25-.43-.25-.94m0 2.83v1.9q0 .51.25.95.26.44.69.69.44.26.96.26.51 0 .94-.26.43-.25.68-.69.26-.44.26-.95 0-.52-.26-.95a1.83 1.83 0 0 0-.68-.69q-.43-.26-.94-.26z" />
  ),
  info: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M1 10a9 9 0 1 1 18 0 9 9 0 0 1-18 0m10-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-.25 3.25a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0z"
    />
  ),
  warning: WARNING_TRIANGLE,
  error: WARNING_TRIANGLE,
  success: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15M10 19a9 9 0 1 0 0-18 9 9 0 0 0 0 18m3.636-12.372a.75.75 0 0 0-1.058.087l-4.125 4.862-1.14-1.61a.75.75 0 0 0-1.225.867l1.7 2.4a.75.75 0 0 0 1.184.051l4.75-5.6a.75.75 0 0 0-.086-1.057"
    />
  ),
};

/**
 * Slack only accepts `alert` in modals; like the other blocks it renders on any surface here, so
 * a payload previews the same wherever it's placed. An unknown `level` falls back to `default`.
 */
export function Alert({ block }: BlockProps) {
  const json = block as Json;
  const level: AlertLevel = LEVELS.has(json.level as AlertLevel)
    ? (json.level as AlertLevel)
    : "default";
  const text = json.text as TextObject | undefined;

  return (
    <div className={`sbk-alert sbk-alert--${level}`} role={level === "error" ? "alert" : "status"}>
      <svg
        className="sbk-alert__icon"
        viewBox="0 0 20 20"
        width="20"
        height="20"
        fill="currentColor"
        aria-hidden="true"
      >
        {ICONS[level]}
      </svg>
      <span className="sbk-alert__message">{text ? <Text text={text} /> : null}</span>
    </div>
  );
}
