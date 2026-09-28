import type { HeaderBlock } from "@slack/types";
import { Text } from "../Text";
import type { BlockProps } from "../types";

/** Builder-only field: renders the header at one of 4 scales. Defaults to 2 (Slack's standard size). */
type HeaderBlockWithLevel = HeaderBlock & { level?: 1 | 2 | 3 | 4 };

const TAGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;

export function Header({ block }: BlockProps<HeaderBlockWithLevel>) {
  const level = block.level ?? 2;
  const Tag = TAGS[level];
  return (
    <Tag className={`sbk-header sbk-header--level-${level}`}>
      <Text text={block.text} />
    </Tag>
  );
}
