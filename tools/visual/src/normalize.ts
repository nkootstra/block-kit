/**
 * Fixes known artifacts of the snapshot so references render the way the Builder did:
 *
 * - The snapshot pins the message time to 12:00 PM, but the timestamp spans keep the width of the
 *   time that was on screen. Drop their fixed sizes so the pinned text lays out naturally.
 * - Older snapshots read tag defaults in a quirks-mode frame, where inputs and textareas default
 *   to border-box, so Slack's border-box was never inlined and they render 17px too tall.
 * - A block captured while selected in the Builder keeps the selection's outline and drop shadow
 *   on its drag wrapper, which Slack never shows in a channel.
 */
export function normalize(html: string): string {
  return html
    .replace(/<span\b[^>]*>/g, (tag) =>
      /class="c-timestamp|data-qa="timestamp_label"/.test(tag)
        ? tag.replace(/style="([^"]*)"/, (_, style: string) => {
            const kept = style
              .split(";")
              .filter(
                (decl) =>
                  !/^(width|height|min-width|max-width|perspective-origin|transform-origin):/.test(
                    decl,
                  ),
              );
            return `style="${kept.join(";")}"`;
          })
        : tag,
    )
    .replace(/<div\b[^>]*\bclass="dragWrapper[^>]*>/g, (tag) =>
      tag.replace(/box-shadow:[^;"]*;?/, ""),
    )
    .replace(/<(input|textarea)\b[^>]*>/g, (tag) =>
      /box-sizing:/.test(tag) ? tag : tag.replace(/style="/, 'style="box-sizing:border-box;'),
    );
}
