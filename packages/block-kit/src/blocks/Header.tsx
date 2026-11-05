import type { HeaderBlock } from "@slack/types";
import { Text } from "../Text";
import type { BlockProps } from "../types";

/** Builder-only field: renders the header at one of 4 scales. Defaults to 2 (Slack's standard size). */
type HeaderBlockWithLevel = HeaderBlock & { level?: 1 | 2 | 3 | 4 };

const TAGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * A payload `level` becomes both the heading tag and a class. Only 1, 2, 3 or 4 are accepted;
 * anything else (a string, an object, a number out of range) renders at 2.
 */
function headerLevel(level: unknown): 1 | 2 | 3 | 4 {
  return level === 1 || level === 2 || level === 3 || level === 4 ? level : 2;
}

export function Header({ block }: BlockProps<HeaderBlockWithLevel>) {
  const level = headerLevel(block.level);
  const Tag = TAGS[level];
  return (
    <Tag className={`sbk-header sbk-header--level-${level}`}>
      <Text text={block.text} />
    </Tag>
  );
}
