import type { BlockProps, Json } from "../types";
import { Block } from "./Block";

/** This library only ever renders as Slack's desktop client, matching the Builder's preview. */
const CLIENT = "desktop";

interface ConditionClause {
  type: string;
  op?: "=" | "!=";
  value?: string;
}

function matches(condition: ConditionClause): boolean {
  if (condition.type !== "client") return false;
  const isEqual = condition.value === CLIENT;
  return condition.op === "!=" ? !isEqual : isEqual;
}

/** Renders the first case whose conditions all match the desktop client, else `default`. */
export function Condition({ block }: BlockProps) {
  const json = block as Json;
  const cases =
    (json.cases as { conditions: ConditionClause[]; blocks: Json[] }[] | undefined) ?? [];
  const defaultBlocks = (json.default as Json[] | undefined) ?? [];

  const matched = cases.find((c) => c.conditions.every(matches));
  const blocks = matched?.blocks ?? defaultBlocks;

  return (
    <>
      {blocks.map((child, i) => (
        <Block key={(child.block_id as string | undefined) ?? i} block={child} index={i} />
      ))}
    </>
  );
}
