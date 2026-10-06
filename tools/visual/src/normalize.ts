/**
 * Fixes known artifacts of the snapshot so references render the way the Builder did:
 *
 * - The snapshot pins the message time to 12:00 PM, but the timestamp spans keep the width (and,
 *   as a flex item in the header, the flex basis) of the time that was on screen. Drop their fixed
 *   sizes so the pinned text lays out naturally instead of wrapping onto a second line.
 * - Older snapshots read tag defaults in a quirks-mode frame, where inputs and textareas default
 *   to border-box, so Slack's border-box was never inlined and they render 17px too tall.
 * - A block captured while selected in the Builder keeps the selection's outline and drop shadow
 *   on its drag wrapper, which Slack never shows in a channel.
 * - Older captures lost every non-ASCII character to "?", including the icon-font glyphs Slack
 *   draws in ::before / ::after. Put back the content Slack's stylesheet gives those elements.
 * - Scrollbar pseudo-elements can't be read from computed styles, so the snapshot misses the
 *   modal body's custom scrollbar: an 8px track whose thumb stays transparent until hovered.
 *   Without it the reference falls back to the harness's 15px scrollbar and lays out narrower.
 * - Pseudo-element styles were diffed against a plain span, so an icon glyph's `font-style:normal`
 *   was dropped and it inherits italic from its <i> host, which slants it. Slack's is upright.
 * - An inherited property reset to its default was dropped too: Slack's gallery scroller is
 *   `nowrap` and its carousel cards set `wrap` again, so card bodies rendered as one clipped line.
 * - The same goes for a data table's scroller, whose 8px scrollbar Slack also keeps idle-invisible.
 * - Links were diffed against an <a> without an href, which isn't underlined, so a link Slack
 *   leaves plain never got `text-decoration:none` and picks up the browser's underline here.
 */
export function normalize(html: string): string {
  return uprightPseudos(
    wrapCarouselCards(addDataTableScrollbar(addModalScrollbar(restoreGlyphs(html)))),
  )
    .replace(/<span\b[^>]*>/g, (tag) =>
      /class="c-timestamp|data-qa="timestamp_label"/.test(tag)
        ? tag.replace(/style="([^"]*)"/, (_, style: string) => {
            const kept = style
              .split(";")
              .filter(
                (decl) =>
                  !/^(width|height|min-width|max-width|flex-basis|flex-grow|flex-shrink|perspective-origin|transform-origin):/.test(
                    decl,
                  ),
              );
            return `style="${kept.join(";")}"`;
          })
        : tag,
    )
    .replace(/<a\b[^>]*\bhref="[^>]*>/g, (tag) =>
      /text-decoration:/.test(tag) ? tag : tag.replace(/style="/, 'style="text-decoration:none;'),
    )
    .replace(/<div\b[^>]*\bclass="dragWrapper[^>]*>/g, (tag) =>
      tag.replace(/box-shadow:[^;"]*;?/, ""),
    )
    .replace(/<(input|textarea)\b[^>]*>/g, (tag) =>
      /box-sizing:/.test(tag) ? tag : tag.replace(/style="/, 'style="box-sizing:border-box;'),
    );
}

/** `content` of Slack's `.c-icon--<type>::before`, as read from its stylesheet. */
const ICON_GLYPHS: Record<string, string> = {
  calendar: "\\e023",
  "caret-down": "\\e271",
  "clock-o": "\\e079",
  enter: "\\e302",
  "envelope-o": "\\e037",
  link: "\\e074",
  "play-filled": "\\e539",
};

/** `.p-rich_text_list__bullet[data-indent]` bullets, which repeat every three levels. */
const BULLET_GLYPHS = ["\\e506", "\\e507", "\\e509"];

function restoreGlyphs(html: string): string {
  const glyphFor = (ref: string, pseudo: string): string | undefined => {
    const at = html.search(new RegExp(`<[a-z]+\\b[^>]*\\bdata-ref="${ref}"`));
    if (at < 0) return undefined;
    const tag = html.slice(at, html.indexOf(">", at) + 1);
    const classes = (tag.match(/\bclass="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    if (pseudo === "::after" && classes.includes("c-emoji")) return '"\\200b" / ""';
    if (pseudo !== "::before") return undefined;
    const icon = classes.find((c) => c.startsWith("c-icon--") && c.slice(8) in ICON_GLYPHS);
    if (icon) return `"${ICON_GLYPHS[icon.slice(8)]}"`;
    if (tag.startsWith("<li")) {
      // The innermost list still open at the <li> decides its level.
      const open: number[] = [];
      for (const [t, indent] of html
        .slice(0, at)
        .matchAll(/<\/?ul\b(?:[^>]*\bdata-indent="(\d+)")?/g)) {
        if (t.startsWith("</")) open.pop();
        else open.push(Number(indent ?? 0));
      }
      const indent = open.at(-1);
      if (indent !== undefined) return `"${BULLET_GLYPHS[indent % 3]}"`;
    }
    return undefined;
  };

  return html.replace(
    /(\[data-ref="(\d+)"\](::before|::after)\{)([^}]*)\}/g,
    (rule, head: string, ref: string, pseudo: string, body: string) => {
      if (!/content:"\?"/.test(body)) return rule;
      const glyph = glyphFor(ref, pseudo);
      if (!glyph) return rule;
      return `${head}${body.replace(/content:"\?"(?: \/ "")?/g, `content:${glyph}`)}}`;
    },
  );
}

const MODAL_SCROLLBAR = "p-bkb_preview_modal__body--slack_scrollbar";

/** Slack's `.supports_custom_scrollbar .p-bkb_preview_modal__body--slack_scrollbar` rules, idle. */
function addModalScrollbar(html: string): string {
  if (!html.includes(`${MODAL_SCROLLBAR}"`) && !html.includes(`${MODAL_SCROLLBAR} `)) return html;
  const rule = `.${MODAL_SCROLLBAR}::-webkit-scrollbar{`;
  if (html.includes(rule)) return html;
  const css = [
    `${rule}width:8px}`,
    `.${MODAL_SCROLLBAR}::-webkit-scrollbar-track,.${MODAL_SCROLLBAR}::-webkit-scrollbar-thumb,.${MODAL_SCROLLBAR}::-webkit-scrollbar-corner{background:transparent}`,
  ].join("\n");
  return html.replace("</style>", `${css}\n</style>`);
}

/** Slack's `.dataTableBlockContainer` scrollbar rules, idle: an 8px track, its thumb hidden. */
function addDataTableScrollbar(html: string): string {
  const scroller = html.match(/class="(dataTableBlockContainer__[\w-]+)/)?.[1];
  if (!scroller) return html;
  const rule = `.${scroller}::-webkit-scrollbar{`;
  if (html.includes(rule)) return html;
  const css = [
    `${rule}width:8px;height:8px}`,
    `.${scroller}::-webkit-scrollbar-track,.${scroller}::-webkit-scrollbar-thumb,.${scroller}::-webkit-scrollbar-corner{background:transparent}`,
  ].join("\n");
  return html.replace("</style>", `${css}\n</style>`);
}

function uprightPseudos(html: string): string {
  return html.replace(
    /(\[data-ref="(\d+)"\]::(?:before|after)\{)([^}]*)\}/g,
    (rule, head: string, ref: string, body: string) => {
      if (/(^|;)font-style:/.test(body)) return rule;
      if (!new RegExp(`<(i|em)\\b[^>]*\\bdata-ref="${ref}"`).test(html)) return rule;
      return `${head}${body};font-style:normal}`;
    },
  );
}

const GALLERY_CONTENT = "p-gallery_scroller__content";

function wrapCarouselCards(html: string): string {
  const rule = `.${GALLERY_CONTENT}>*{`;
  if (!html.includes(`class="${GALLERY_CONTENT}"`) || html.includes(rule)) return html;
  return html.replace("</style>", `${rule}text-wrap-mode:wrap}\n</style>`);
}
