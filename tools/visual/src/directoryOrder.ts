/**
 * The directory a reference's open list shows. Slack lists the Builder workspace's members and
 * channels by the workspace's recent activity, and redaction numbers them in the order they appear
 * ("channel-one" is whichever channel came first), so the order and which channels are private
 * change between capture sessions. They're input, like the names, and the render lists its
 * placeholder directory the same way.
 * Takes each option's text and whether it shows a lock; returns the redacted names in order, a
 * private channel's as `channel-one:private`.
 */
export function directoryOrder(options: { text: string; locked: boolean }[]): string[] {
  const names: string[] = [];
  for (const { text, locked } of options) {
    const name = /^\s*(User [A-Z][a-z]+|channel-[a-z]+)/.exec(text)?.[1];
    if (!name || names.some((n) => n.split(":")[0] === name)) continue;
    names.push(locked && name.startsWith("channel-") ? `${name}:private` : name);
  }
  return names;
}
