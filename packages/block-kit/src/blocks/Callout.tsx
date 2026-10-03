import type { BlockProps, Json } from "../types";
import { Block } from "./Block";

/** Callout colours; each has a token per theme (Callout.css, and Message.css for dark). */
const BACKGROUND_COLORS = new Set(["green", "blue", "red", "yellow", "purple", "gray"]);

export function Callout({ block }: BlockProps) {
  const json = block as Json;
  const color = typeof json.background_color === "string" ? json.background_color : undefined;
  const key = color === "grey" ? "gray" : color;
  const background = `var(--sbk-callout-${key && BACKGROUND_COLORS.has(key) ? key : "gray"}-bg)`;
  const children = (json.child_blocks as Json[] | undefined) ?? [];

  return (
    <div className="sbk-callout" style={{ backgroundColor: background }}>
      {children.map((child, i) => (
        <Block key={(child.block_id as string | undefined) ?? i} block={child} index={i} />
      ))}
    </div>
  );
}
