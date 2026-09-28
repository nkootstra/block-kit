import type { BlockProps, Json } from "../types";
import { Block } from "./Block";

/**
 * Measured from Builder references (`callout` background_color: "green" → #f4ffdb, "blue" →
 * #e3f8ff). The remaining keys aren't covered by a fixture; they're extrapolated to the same
 * pastel-tint style and may not match Slack's exact values.
 */
const BACKGROUND_COLORS: Record<string, string> = {
  green: "#f4ffdb",
  blue: "#e3f8ff",
  red: "#ffeceb",
  yellow: "#fff8db",
  purple: "#f3ecff",
  gray: "#f4f4f4",
  grey: "#f4f4f4",
};

export function Callout({ block }: BlockProps) {
  const json = block as Json;
  const color = typeof json.background_color === "string" ? json.background_color : undefined;
  const background = (color && BACKGROUND_COLORS[color]) ?? BACKGROUND_COLORS.gray;
  const children = (json.child_blocks as Json[] | undefined) ?? [];

  return (
    <div className="sbk-callout" style={{ backgroundColor: background }}>
      {children.map((child, i) => (
        <Block key={(child.block_id as string | undefined) ?? i} block={child} index={i} />
      ))}
    </div>
  );
}
