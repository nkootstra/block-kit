import { redact, type Sighting } from "./redact";

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
 * - Slack draws a mention it can't resolve as a loading bar of a random width (80, 120 or 160px),
 *   so each capture laid the rest of the line out differently. It's always 120px here, and the
 *   boxes around a bar that was another width let go of the heights they froze around it.
 * - Links were diffed against an <a> without an href, which isn't underlined, so a link Slack
 *   leaves plain never got `text-decoration:none` and picks up the browser's underline here.
 * - Older snapshots froze a field without a string value as `value="undefined"`, which the
 *   reference then draws as text.
 * - The Builder workspace's members, channels, name and IDs are swapped for placeholders
 *   (redact.ts); `mapping` adds the maintainer's local redact.local.json, and `known` the members
 *   and channels the capture's other references show, so each gets the same placeholder in all.
 */
export function normalize(
  html: string,
  mapping: Record<string, string> = {},
  known: Sighting[] = [],
): string {
  return redact(
    pinMissingText(
      uprightPseudos(
        wrapCarouselCards(addDataTableScrollbar(addModalScrollbar(restoreGlyphs(html)))),
      ),
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
        (/box-sizing:/.test(tag)
          ? tag
          : tag.replace(/style="/, 'style="box-sizing:border-box;')
        ).replace(/\svalue="undefined"/, ' value=""'),
      ),
    mapping,
    known,
  );
}

const PINNED_BAR = 120;
const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

/**
 * Pins every `c-missing_text` bar to 120px. The width a bar had live survives in its transform
 * origin (half its border box), as the snapshot froze it next to the width. Where that wasn't
 * 120px, the line around the bar broke differently live, and every box holding it froze the height
 * of that layout: a 160px bar that wrapped the paragraph onto one more line leaves a blank line
 * below it at 120px. So those boxes drop their frozen `height` and lay out from their content.
 * The bar keeps its live width in `data-sbk-live-width`, so compare.ts can move a popover Slack
 * placed against that layout (the bar's own tooltip) along with the bar.
 */
function pinMissingText(html: string): string {
  const tag = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*>/g;
  const open: { name: string; start: number }[] = [];
  const release = new Set<number>();
  const bars: { start: number; live: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = tag.exec(html))) {
    const name = (match[2] ?? "").toLowerCase();
    if (match[1] === "/") {
      const at = open.findLastIndex((e) => e.name === name);
      if (at !== -1) open.length = at;
      continue;
    }
    if (name === "script" || name === "style") {
      const end = html.indexOf(`</${name}`, tag.lastIndex);
      tag.lastIndex = end < 0 ? html.length : end;
      continue;
    }
    if (/^<span\b[^>]*\bclass="c-missing_text/.test(match[0])) {
      const style = match[0].match(/style="([^"]*)"/)?.[1] ?? "";
      const width = Number(style.match(/(?:^|;)width:([\d.]+)px/)?.[1] ?? PINNED_BAR);
      const origin = style.match(/(?:^|;)transform-origin:([\d.]+)px/)?.[1];
      const live = origin === undefined ? width : Number(origin) * 2;
      bars.push({ start: match.index, live });
      if (width !== PINNED_BAR || live !== PINNED_BAR) for (const e of open) release.add(e.start);
    }
    if (!VOID.test(name) && !match[0].endsWith("/>")) open.push({ name, start: match.index });
  }
  if (bars.length === 0) return html;

  const edits = new Map<number, (tag: string) => string>();
  for (const start of release) {
    edits.set(start, (t) =>
      t.replace(/style="([^"]*)"/, (_, style: string) => {
        const kept = style.split(";").filter((d) => !/^height:[\d.]+px$/.test(d));
        return `style="${kept.join(";")}"`;
      }),
    );
  }
  for (const { start, live } of bars) {
    edits.set(start, (t) => {
      const pinned = t
        .replace(/((?:^|[";])width:)[\d.]+px/, `$1${PINNED_BAR}px`)
        .replace(/((?:^|[";])(?:perspective|transform)-origin:)[\d.]+px/g, `$1${PINNED_BAR / 2}px`);
      return live === PINNED_BAR || /\sdata-sbk-live-width=/.test(pinned)
        ? pinned
        : pinned.replace(/\/?>$/, (end) => ` data-sbk-live-width="${live}"${end}`);
    });
  }
  let out = "";
  let last = 0;
  for (const start of [...edits.keys()].toSorted((a, b) => a - b)) {
    const end = html.indexOf(">", start) + 1;
    out += html.slice(last, start) + edits.get(start)!(html.slice(start, end));
    last = end;
  }
  return out + html.slice(last);
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
