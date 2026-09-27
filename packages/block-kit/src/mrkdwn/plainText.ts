import type { Emoji, Text } from "./ast";

const EMOJI_RE = /^:([a-z0-9_+'-]+):(?::skin-tone-([2-6]):)?/i;

/**
 * Converts `:name:` shortcodes in a `plain_text` object's text into emoji nodes. Plain text has no
 * other mrkdwn formatting (no bold/links/mentions), so this only ever produces `text` and `emoji`.
 */
export function parsePlainTextEmoji(input: string): Array<Text | Emoji> {
  const nodes: Array<Text | Emoji> = [];
  let buffer = "";
  let i = 0;

  const flush = () => {
    if (!buffer) return;
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") last.value += buffer;
    else nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  while (i < input.length) {
    if (input[i] === ":") {
      const match = EMOJI_RE.exec(input.slice(i));
      if (match) {
        flush();
        const skinTone = match[2] ? Number(match[2]) : undefined;
        nodes.push({
          type: "emoji",
          name: (match[1] as string).toLowerCase(),
          ...(skinTone ? { skinTone } : {}),
        });
        i += match[0].length;
        continue;
      }
    }
    buffer += input[i];
    i++;
  }
  flush();
  return nodes;
}
