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
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  const found = new Set<string>();
  for (const [, raw] of body.matchAll(/>([^<]+)</g)) {
    const text = unescapeHtml(raw ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (text && sentences.has(text) && !own.has(text)) found.add(text);
  }
  return [...found];
}
