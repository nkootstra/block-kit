/**
 * Catches a reference that shows some other fixture. When Block Kit Builder refuses a payload it
 * keeps showing the previous one, but the snapshot still records the refused payload (it reads it
 * from the URL), so the lock can't tell. Text that another fixture's payload writes, and this
 * one's doesn't, can only be such a leftover.
 */

const META = /<script type="application\/json" id="sbk-reference-meta">([\s\S]*?)<\/script>/;

const unescapeHtml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&");

/** Elements whose content is never visible text. */
const RAW_TEXT = new Set(["script", "style"]);

/**
 * The text between tags, skipping script and style content. A small tokenizer rather than regex
 * stripping, so tag-name case, closing-tag spacing or a split tag can't let their content through.
 * A `<` that doesn't open a tag (another `<` comes before its `>`) is text.
 */
export function textNodes(html: string): string[] {
  const lower = html.toLowerCase();
  const texts: string[] = [];
  let text = "";
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    if (open === -1) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, open);
    const close = html.indexOf(">", open + 1);
    const nextOpen = html.indexOf("<", open + 1);
    if (close === -1 || (nextOpen !== -1 && nextOpen < close)) {
      text += "<";
      i = open + 1;
      continue;
    }
    if (text) texts.push(text);
    text = "";
    const name = /^\/?\s*([a-z][a-z0-9-]*)/.exec(lower.slice(open + 1, close))?.[1] ?? "";
    const closing = lower[open + 1] === "/";
    if (!closing && RAW_TEXT.has(name)) {
      const end = lower.indexOf(`</${name}`, close + 1);
      if (end === -1) break;
      const endClose = html.indexOf(">", end);
      i = endClose === -1 ? html.length : endClose + 1;
      continue;
    }
    i = close + 1;
  }
  if (text) texts.push(text);
  return texts;
}

/** Every string in a payload. */
export function payloadStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) payloadStrings(item, out);
  return out;
}

/** The sentences fixtures write (four words or more), for `foreignText`. */
export function fixtureSentences(payloads: Iterable<unknown>): Set<string> {
  const sentences = new Set<string>();
  for (const payload of payloads)
    for (const s of payloadStrings(payload))
      if (s.trim().split(/\s+/).length >= 4) sentences.add(s.trim());
  return sentences;
}

/** The text in `html` that another fixture writes and its own payload doesn't. */
export function foreignText(html: string, sentences: Set<string>): string[] {
  const payload = JSON.parse(html.match(META)?.[1] ?? "{}").payload ?? null;
  const own = new Set(payloadStrings(payload).map((s) => s.trim()));
  const found = new Set<string>();
  for (const raw of textNodes(html)) {
    const text = unescapeHtml(raw).replace(/\s+/g, " ").trim();
    if (text && sentences.has(text) && !own.has(text)) found.add(text);
  }
  return [...found];
}

/** The strings a payload shows before anything is clicked: a confirm dialog's text waits for one. */
function shownStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) if (key !== "confirm") shownStrings(item, out);
  return out;
}

const words = (text: string) => text.toLowerCase().match(/[a-z]{4,}/g) ?? [];

/**
 * The payload's sentences, when the reference shows not one of their words. A refused payload can
 * leave a render that no other fixture's sentence gives away (a modal's datetime picker in place
 * of a section with one), but it still lacks every word its own payload writes. Words rather than
 * whole sentences, since mrkdwn, links and emoji change how a sentence reads on screen.
 */
export function missingText(html: string): string[] {
  const payload = JSON.parse(html.match(META)?.[1] ?? "{}").payload ?? null;
  const sentences = [...fixtureSentences([shownStrings(payload)])];
  const shown = new Set(words(textNodes(html).map(unescapeHtml).join(" ")));
  return sentences.some((s) => words(s).some((w) => shown.has(w))) ? [] : sentences;
}
