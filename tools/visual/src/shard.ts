/**
 * The fixtures one slice of a sharded comparison runs: `--shard=2/4` keeps every fourth name of the
 * sorted list, starting from the second. Dealing the names out in turn, rather than cutting the list
 * into runs, spreads each fixture's states (a family of @hover, @focus and @open references that
 * take longest) over every slice.
 */
export function shard<T>(items: readonly T[], spec: string | undefined): T[] {
  if (spec === undefined) return [...items];
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || count < 1 || index < 1 || index > count) {
    throw new Error(`--shard takes <index>/<count> with 1 <= index <= count, not "${spec}"`);
  }
  return items.filter((_, i) => i % count === index - 1);
}
