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
  // A tag's defaults, as its replay will resolve them. Many are em-based (an <hr>'s 0.5em margin,
  // an <h2>'s 1.5em font size): measured at the iframe's 16px they'd match Slack's 8px margin and
  // leave it out, and the replay would resolve 0.5em at Slack's 15px. So each probe sits in a
  // parent at the element's parent's font size and takes the element's own font size, except for
  // `font-size` itself, which defaults relative to the parent.
  const defaults = new Map();
  const defaultsFor = (el, fontSize, parentFontSize) => {
    const key = `${el.namespaceURI}|${el.localName}|${fontSize}|${parentFontSize}`;
    if (!defaults.has(key)) {
      const probeIn = (ownFontSize) => {
        const wrapper = fdoc.createElement("div");
        if (parentFontSize) wrapper.style.fontSize = parentFontSize;
        fdoc.body.appendChild(wrapper);
        const probe = fdoc.createElementNS(el.namespaceURI, el.localName);
        if (ownFontSize && probe.style) probe.style.fontSize = ownFontSize;
        (el.namespaceURI === "http://www.w3.org/2000/svg" && el.localName !== "svg"
          ? wrapper.appendChild(fdoc.createElementNS(el.namespaceURI, "svg"))
          : wrapper
        ).appendChild(probe);
        return frame.contentWindow.getComputedStyle(probe);
      };
      const cs = probeIn(fontSize);
      const map = {};
      for (let i = 0; i < cs.length; i++) map[cs[i]] = cs.getPropertyValue(cs[i]);
      map["font-size"] = probeIn(undefined).getPropertyValue("font-size");
      defaults.set(key, map);
    }
    return defaults.get(key);
  };

  // Custom properties (Slack defines hundreds on :root) and logical aliases of physical
  // properties only add noise; the physical values are already inlined.
  const SKIP =
    /^(--|transition|animation|will-change|cursor|caret|-webkit-tap|pointer-events|user-select|-webkit-user|block-size|inline-size|min-block|min-inline|max-block|max-inline|border-block|border-inline|margin-block|margin-inline|padding-block|padding-inline|inset-block|inset-inline|border-start|border-end|column-rule-color|outline-color|text-emphasis-color|-webkit-text-fill-color|-webkit-text-stroke-color)/;
  // Properties an element inherits. One reset to its default (a card's `wrap` inside a `nowrap`
  // scroller) equals the tag default, but still has to be inlined or the parent's value wins.
  const INHERITED =
    /^(color|font|line-height|letter-spacing|word-spacing|text-align|text-indent|text-transform|text-shadow|text-wrap|white-space|word-break|overflow-wrap|hyphens|tab-size|direction|visibility|list-style|quotes|-webkit-text-security)/;
  // Every box keeps its used size: leaving the sizes the content decides to the replay changes
  // what the boxes around them shrink and grow to (a checkbox label's text lost 4px to the box
  // beside it and wrapped). Three corrections make the frozen sizes replay exactly:
  // - A width serializes to six significant digits, so 100.0625 comes out as "100.062px": a hair
  //   short, and a label sized to its text wraps. Layout works in 1/64px units, so a width is
  //   rounded up to the next unit (less the serialization error), which recovers the exact value.
  // - Frozen sizes are final, so a flex item in a row is pinned to its width (flex: 0 0 <width>):
  //   with widths rounded up, a full row could overflow by a fraction of a pixel and squeeze a
  //   tight label after all, and an item with its own flex-basis would ignore its width.
  // - A grid's resolved track list includes its implicit rows; frozen as explicit rows, an item
  //   placed after the grid lands a row lower. CSS Typed OM gives the authored list ("auto auto").
  // - A height the page leaves at `auto` isn't frozen: a box with a set height stops its last
  //   child's bottom margin from collapsing through it, so the block after it moved up by that
  //   margin. With every width frozen, the content lays out the same and gives the same height.
  //   Images and form controls keep theirs, since an image that fails to load may not replay.
  const REPLACED = /^(img|svg|video|canvas|iframe|object|embed|input|textarea|select)$/i;
  const UNIT = 64;
  const roundUpToUnit = (px) => Math.ceil(px * UNIT - 0.032) / UNIT;
  const sizeOverrides = (el, cs, parentStyle) => {
    const out = {};
    const width = cs.getPropertyValue("width");
    if (/^[\d.]+px$/.test(width)) out.width = `${roundUpToUnit(Number.parseFloat(width))}px`;
    if (
      out.width &&
      parentStyle &&
      parentStyle.display.endsWith("flex") &&
      parentStyle.flexDirection.startsWith("row") &&
      cs.position !== "absolute" &&
      cs.position !== "fixed"
    ) {
      out["flex-basis"] = out.width;
      out["flex-grow"] = "0";
      out["flex-shrink"] = "0";
    }
    if (el.computedStyleMap && el.namespaceURI === "http://www.w3.org/1999/xhtml") {
      const map = el.computedStyleMap();
      if (!REPLACED.test(el.localName) && String(map.get("height")) === "auto") out.height = null;
      for (const prop of ["grid-template-rows", "grid-template-columns"]) {
        const value = String(map.get(prop));
        if (value !== "none") out[prop] = value;
      }
    }
    return out;
  };

  // A pseudo-element inherits from its host, not from a plain span: pass the host's computed style
  // as `host` so a value that differs from it (an icon's upright glyph in an italic <i>) is kept.
  // For an element, `host` is its parent and only inherited properties are compared. `overrides`
  // replaces computed values (see sizeOverrides); null leaves the property out.
  const diff = (cs, base, host, inheritedOnly = false, overrides = {}) => {
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (SKIP.test(prop)) continue;
      if (overrides[prop] === null) continue;
      const value = overrides[prop] ?? cs.getPropertyValue(prop);
      if (
        value !== base[prop] ||
        (host && (!inheritedOnly || INHERITED.test(prop)) && value !== host.getPropertyValue(prop))
      ) {
        out.push(`${prop}:${value}`);
      }
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

  // Transitions, animations, the cursor and pointer-events would only get in the way of a frozen
  // render, so SKIP keeps them out of the inlined styles. They're recorded per element in the meta
  // instead (keyed by data-ref), so a comparison can still check how Slack's elements move.
  const MOTION = [
    "transition-property",
    "transition-duration",
    "transition-timing-function",
    "transition-delay",
    "animation-name",
    "animation-duration",
    "animation-timing-function",
    "animation-delay",
    "animation-iteration-count",
    "animation-direction",
    "animation-fill-mode",
  ];
  const INHERITED_MOTION = ["cursor", "pointer-events"];
  const motion = {};
  const motionOf = (cs, base, parent) => {
    const out = {};
    for (const prop of MOTION) {
      const value = cs.getPropertyValue(prop);
      if (value !== base[prop]) out[prop] = value;
    }
    // Inherited: only where the element changes what it inherits, not on every descendant.
    for (const prop of INHERITED_MOTION) {
      const value = cs.getPropertyValue(prop);
      if (parent ? value !== parent.getPropertyValue(prop) : value !== base[prop])
        out[prop] = value;
    }
    return out;
  };

  const pseudoRules = [];
  let refs = 0;
  // A page without a base URL (about:blank) can't resolve a relative URL; keep it as written.
  const abs = (url) => {
    try {
      return new URL(url, win.location.href).href;
    } catch {
      return url;
    }
  };

  const freeze = (src, parent) => {
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
    const base = defaultsFor(src, cs.fontSize, parent?.fontSize);
    el.setAttribute("style", diff(cs, base, parent, true, sizeOverrides(src, cs, parent)));
    const moves = motionOf(cs, base, parent);
    if (Object.keys(moves).length > 0) {
      el.setAttribute("data-ref", String(++refs));
      motion[el.getAttribute("data-ref")] = moves;
    }

    for (const pseudo of ["::before", "::after"]) {
      const ps = win.getComputedStyle(src, pseudo);
      if (ps.content && ps.content !== "none" && ps.content !== "normal") {
        if (!el.hasAttribute("data-ref")) el.setAttribute("data-ref", String(++refs));
        const pseudoBase = defaultsFor(
          { namespaceURI: "http://www.w3.org/1999/xhtml", localName: "span" },
          ps.fontSize,
          cs.fontSize,
        );
        pseudoRules.push(
          cssAscii(
            `[data-ref="${el.getAttribute("data-ref")}"]${pseudo}{content:${ps.content};${diff(ps, pseudoBase, cs)}}`,
          ),
        );
      }
    }

    for (const child of src.childNodes) {
      const frozen = freeze(child, cs);
      if (frozen) el.appendChild(frozen);
    }
    return el;
  };

  // The root replays inside a bare #sbk-reference, not inside Slack's app, so what it inherits
  // (Slack's font) is compared with the defaults, not with its parent, and written down.
  const frozen = freeze(root, null);
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
    motion,
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
