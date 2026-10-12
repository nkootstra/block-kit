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

/**
 * Keys whose strings a reference doesn't show at rest: a confirm dialog's text waits for a click,
 * as do an overflow menu's options; a date's fallback and a citation's details stand in for what
 * Slack renders instead.
 */
const HIDDEN = new Set(["confirm", "fallback", "details"]);

/** The strings a payload shows before anything is clicked. */
function shownStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") {
    const overflow = (value as { type?: unknown }).type === "overflow";
    // A field holding a value hides its placeholder, at least once its list opens.
    const filled = Object.keys(value).some((k) => k.startsWith("initial_"));
    for (const [key, item] of Object.entries(value))
      if (
        !HIDDEN.has(key) &&
        !(overflow && key === "options") &&
        !(filled && key === "placeholder")
      )
        shownStrings(item, out);
  }
  return out;
}

/** Text a reference shows in attributes: a field's placeholder, a control's accessible name. */
function attributeText(html: string): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  return [...body.matchAll(/\s(?:placeholder|aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1]!);
}

const words = (text: string) => text.toLowerCase().match(/[a-z]{4,}/g) ?? [];

/**
 * The payload's sentences, when the reference shows not one of their words. A refused payload can
 * leave a render that no other fixture's sentence gives away (a modal's datetime picker in place
 * of a section with one), but it still lacks every word its own payload writes. Words rather than
 * whole sentences, since mrkdwn, links and emoji change how a sentence reads on screen. A field's
 * placeholder and a control's accessible name are attributes, not text, so they count too.
 */
export function missingText(html: string): string[] {
  const payload = JSON.parse(html.match(META)?.[1] ?? "{}").payload ?? null;
  const sentences = [...fixtureSentences([shownStrings(payload)])];
  const shown = new Set(
    words([...textNodes(html), ...attributeText(html)].map(unescapeHtml).join(" ")),
  );
  return sentences.some((s) => words(s).some((w) => shown.has(w))) ? [] : sentences;
}

const TEXT_INPUTS = /^(plain_text_input|number_input|email_text_input|url_text_input)$/;
const INITIAL = ["initial_options", "initial_users", "initial_conversations", "initial_channels"];

/** Every interactive element in a payload (an object with an `action_id`), in document order. */
function elementsOf(value: unknown, out: Record<string, unknown>[] = [], key?: string) {
  if (Array.isArray(value)) for (const v of value) elementsOf(v, out, key);
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.type === "string" && typeof o.action_id === "string")
      out.push(key === "accessory" ? { ...o, accessory: true } : o);
    for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") elementsOf(v, out, k);
  }
  return out;
}

/**
 * State a reference shows that its own payload doesn't set: Block Kit Builder keeps an element's
 * chips and values across payloads with the same block and action ids, so a capture can show an
 * earlier item's choice. Read from the frozen message only (an open dialog shows chips of its own):
 * multi-select chips and text input values. Empty when the reference shows what its payload sets.
 */
export function foreignState(html: string, payload: unknown): string[] {
  const message = html.split("data-sbk-layer")[0] ?? html;
  const els = elementsOf(payload);
  const out: string[] = [];
  // A section accessory's multi-select is a button that counts its choices; it shows no chips.
  const chips = els
    .filter((e) => (e.type as string).startsWith("multi_") && !e.accessory)
    .reduce(
      (n, e) => n + INITIAL.reduce((m, f) => m + ((e[f] as unknown[] | undefined)?.length ?? 0), 0),
      0,
    );
  // The chip itself, `c-token`, not its parts (`c-token--member c-token__avatar`): `\b` alone would
  // also match `c-token--member`, which a user chip's avatar carries.
  const shownChips = [...message.matchAll(/class="(?:[^"]*\s)?c-token(?=[\s"])/g)].length;
  if (shownChips !== chips) out.push(`chips: ${shownChips}, expected ${chips}`);
  const values = els
    .filter((e) => TEXT_INPUTS.test(e.type as string))
    .map((e) => `${e.initial_value ?? ""}`);
  const shown = [
    ...message.matchAll(
      /<(?:input|textarea)\b[^>]*class="[^"]*p-block_kit_[^"]*_input_element[^"]*"[^>]*>/g,
    ),
  ].map(([tag]) => unescapeHtml(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? ""));
  if (shown.length === values.length)
    shown.forEach((v, i) => {
      if (v !== values[i]) out.push(`input ${i + 1}: "${v}", expected "${values[i]}"`);
    });
  return out;
}
