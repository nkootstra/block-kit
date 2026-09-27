/* oxlint-disable no-unused-expressions -- this file is a bare function expression, evaluated in the page */
// Freezes the Block Kit Builder preview into a self-contained HTML document.
// Evaluates to an async function taking the Builder's window (a same-origin iframe works too,
// which avoids its CSP blocking eval) and resolving to the HTML string.
// Every element gets the computed styles that differ from its tag's defaults inlined, so the
// snapshot renders the same without Slack's stylesheets.
async (win = window) => {
  const doc = win.document;
  const FIXED_TIME = "12:00 PM";
  // The Builder previews each surface in its own container.
  const ROOTS = {
    message: ".p-bkb_preview__message",
    modal: ".p-bkb_preview_modal",
    home: ".p-bkb_app_home",
  };
  const [surface, root] =
    Object.entries(ROOTS)
      .map(([name, selector]) => [name, doc.querySelector(selector)])
      .find(([, el]) => el) ?? [];
  if (!root) throw new Error("preview not found");

  const frame = doc.createElement("iframe");
  frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  doc.body.appendChild(frame);
  const fdoc = frame.contentDocument;
  // A fresh iframe is in quirks mode, where inputs default to border-box; the snapshot renders in
  // standards mode, so read defaults there or Slack's border-box inputs lose it.
  fdoc.open();
  fdoc.write("<!doctype html><body></body>");
  fdoc.close();
  const defaults = new Map();
  const defaultsFor = (el) => {
    const key = `${el.namespaceURI}|${el.localName}`;
    if (!defaults.has(key)) {
      const probe = fdoc.createElementNS(el.namespaceURI, el.localName);
      (el.namespaceURI === "http://www.w3.org/2000/svg" && el.localName !== "svg"
        ? fdoc.body.appendChild(fdoc.createElementNS(el.namespaceURI, "svg"))
        : fdoc.body
      ).appendChild(probe);
      const cs = frame.contentWindow.getComputedStyle(probe);
      const map = {};
      for (let i = 0; i < cs.length; i++) map[cs[i]] = cs.getPropertyValue(cs[i]);
      defaults.set(key, map);
    }
    return defaults.get(key);
  };

  // Custom properties (Slack defines hundreds on :root) and logical aliases of physical
  // properties only add noise; the physical values are already inlined.
  const SKIP =
    /^(--|transition|animation|will-change|cursor|caret|-webkit-tap|pointer-events|user-select|-webkit-user|block-size|inline-size|min-block|min-inline|max-block|max-inline|border-block|border-inline|margin-block|margin-inline|padding-block|padding-inline|inset-block|inset-inline|border-start|border-end|column-rule-color|outline-color|text-emphasis-color|-webkit-text-fill-color|-webkit-text-stroke-color)/;
  const diff = (cs, base) => {
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (SKIP.test(prop)) continue;
      const value = cs.getPropertyValue(prop);
      if (value !== base[prop]) out.push(`${prop}:${value}`);
    }
    return out.join(";");
  };

  // The snapshot travels through the clipboard and the console, which have turned every non-ASCII
  // character into "?" before, icon-font glyphs included. Keep the output pure ASCII.
  const NON_ASCII = /[\u0080-\u{10ffff}]/gu;
  const cssAscii = (css) => css.replace(NON_ASCII, (c) => `\\${c.codePointAt(0).toString(16)} `);
  const htmlAscii = (html) =>
    html.replace(NON_ASCII, (c) => `&#x${c.codePointAt(0).toString(16)};`);
  const jsonAscii = (json) =>
    json.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

  const pseudoRules = [];
  let refs = 0;
  const abs = (url) => new URL(url, win.location.href).href;

  const freeze = (src) => {
    if (src.nodeType === win.Node.TEXT_NODE) return doc.createTextNode(src.data);
    if (src.nodeType !== win.Node.ELEMENT_NODE) return null;
    if (/^(script|style|link|noscript|template)$/i.test(src.localName)) return null;
    // Builder chrome (drag handles, block menus) isn't part of how Slack renders the message.
    if ([...src.classList].some((c) => /^(blockSidebar|dropIndicator)/.test(c))) return null;
    const cs = win.getComputedStyle(src);
    if (cs.display === "none") return null;

    const el = src.cloneNode(false);
    // Copy first: removing attributes mutates the live NamedNodeMap mid-iteration.
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || attr.name === "style") el.removeAttribute(attr.name);
    }
    if (el.localName === "img") {
      el.setAttribute("src", src.currentSrc || abs(src.getAttribute("src") || ""));
      el.removeAttribute("srcset");
      el.removeAttribute("loading");
    }
    if (el.localName === "a") el.setAttribute("href", abs(src.getAttribute("href") || "#"));
    if (el.localName === "input" || el.localName === "textarea")
      el.setAttribute("value", src.value);
    el.setAttribute("style", diff(cs, defaultsFor(src)));

    for (const pseudo of ["::before", "::after"]) {
      const ps = win.getComputedStyle(src, pseudo);
      if (ps.content && ps.content !== "none" && ps.content !== "normal") {
        if (!el.hasAttribute("data-ref")) el.setAttribute("data-ref", String(++refs));
        const base = defaultsFor({
          namespaceURI: "http://www.w3.org/1999/xhtml",
          localName: "span",
        });
        pseudoRules.push(
          cssAscii(
            `[data-ref="${el.getAttribute("data-ref")}"]${pseudo}{content:${ps.content};${diff(ps, base)}}`,
          ),
        );
      }
    }

    for (const child of src.childNodes) {
      const frozen = freeze(child);
      if (frozen) el.appendChild(frozen);
    }
    return el;
  };

  const frozen = freeze(root);
  frame.remove();

  // Pin the message timestamp so references don't change between captures. Only the timestamp:
  // a timepicker or datetimepicker shows a time too, and that one is part of the reference.
  for (const node of frozen.querySelectorAll('[data-qa="timestamp_label"]')) {
    node.textContent = FIXED_TIME;
  }

  const fontFaces = [];
  for (const sheet of doc.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof win.CSSFontFaceRule) {
        const base = sheet.href || win.location.href;
        fontFaces.push(
          rule.cssText.replace(
            /url\((['"]?)([^'")]+)\1\)/g,
            (_, q, u) => `url("${new URL(u, base).href}")`,
          ),
        );
      }
    }
  }

  // Slack registers its text fonts through the FontFace API, so they aren't in any stylesheet.
  const FONT_FILES = [
    [/lato-regular-/, "Slack-Lato", 400, "normal"],
    [/lato-bold-/, "Slack-Lato", 700, "normal"],
    [/lato-black-/, "Slack-Lato", 900, "normal"],
    [/lato-italic-/, "Slack-Lato", 400, "italic"],
    [/lato-bolditalic-/, "Slack-Lato", 700, "italic"],
    [/RobotoMono-Regular/, "Slack-Roboto-Mono", "100 700", "normal"],
  ];
  for (const { name } of win.performance.getEntriesByType("resource")) {
    const match = FONT_FILES.find(([re]) => re.test(name));
    if (match) {
      const [, family, weight, style] = match;
      fontFaces.push(
        `@font-face { font-family: ${family}; font-weight: ${weight}; font-style: ${style}; src: url("${name}") format("woff2"); }`,
      );
    }
  }

  const rect = root.getBoundingClientRect();
  const rects = [...root.querySelectorAll(".p-bkb_preview__rendered-block")].map((n) => {
    const r = n.getBoundingClientRect();
    return {
      qa: n.getAttribute("data-qa"),
      blockId: n.getAttribute("data-block-id"),
      x: Math.round(r.x - rect.x),
      y: Math.round(r.y - rect.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
  const meta = {
    capturedAt: new Date().toISOString(),
    source: win.location.href.split("#")[0],
    surface,
    payload: JSON.parse(decodeURIComponent(win.location.hash.slice(1)) || "null"),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    devicePixelRatio: win.devicePixelRatio,
    rects,
  };

  const bodyBg = win.getComputedStyle(
    doc.querySelector(".p-bkb_preview__content") || doc.body,
  ).backgroundColor;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>reference</title>
<script type="application/json" id="sbk-reference-meta">${jsonAscii(JSON.stringify(meta).replace(/</g, "\\u003c"))}</script>
<style>
${cssAscii(fontFaces.join("\n"))}
html,body{margin:0;padding:0;background:${bodyBg === "rgba(0, 0, 0, 0)" ? "#fff" : bodyBg}}
#sbk-reference{width:${Math.round(rect.width)}px}
${pseudoRules.join("\n")}
</style></head>
<body><div id="sbk-reference">${htmlAscii(frozen.outerHTML)}</div></body></html>`;
};
