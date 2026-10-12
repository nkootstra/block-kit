/* oxlint-disable no-unused-expressions -- this file is a bare function expression, evaluated in the page */
// Captures a list of references in Block Kit Builder, one after another. Paste it into the
// Builder's page verbatim, like snapshot.js (the Builder's CSP blocks eval), then:
//
//   window.sbkSnap = <snapshot.js>;
//   window.sbkCapture = <this file>;
//   const refs = await window.sbkCapture({ items: [{ name, payload }, ...], snap: window.sbkSnap });
//
// `name` is a reference name (names.ts): `<fixture>[@<interaction>][+mobile][+dark]`. For each
// item the runner sets the Builder's theme and preview width, loads the payload (switching the
// surface when it must), waits for the preview to settle, performs the interaction, snapshots, and
// closes whatever it opened. It resolves to `{ [name]: html }`, ready for import.ts.
//
// Interactions it performs itself, on the preview's FIRST control of the kind (as compare.ts
// replays them, states.ts): `open` (a select, time list, datepicker, datetime picker or overflow
// menu), `confirm` (the first button) and `dialog` (a section accessory's multi-select). Any other
// interaction (`expanded`, `sort-asc`, …) is left to whoever runs it: the runner sets
// `window.sbkCaptureWaiting` to the name and waits until `window.sbkCaptureReady = true`.
// The same goes when a scripted click doesn't open the control: perform it with a real click and
// set `sbkCaptureReady`.
//
// `substitute` maps placeholder strings in the payloads to the values the Builder should see, e.g. a
// fixture's placeholder Slack file URL to a real file's link kept in a git-ignored local file
// (tools/visual/README.md). Only the Builder sees the real value; import.ts redacts it again.
//
// Real input. `hover-<target>` and `focus-<target>` (names.ts, targets.ts) need input a script
// can't fake: the runner finds the control, scrolls it into view and sets `sbkCaptureWaiting` to an
// instruction (`{ name, do: "hover", target, x, y, box }`, viewport CSS pixels; `{ do: "key", key:
// "Tab" }`). Whoever drives the browser performs it with real input and leaves the pointer where it
// is; the runner sees the state hold (`:hover`, `:focus-visible`) and continues by itself, and
// checks it still holds after the snapshot. `submit-errors` presses a modal's submit.
//
// Behaviour probes. An item with a `probe` (`{ steps, snapshot? }`, probes.ts) runs its steps on the
// preview, each with real input by default (the same instructions; `real: false` dispatches scripted
// events instead), and records what `observe` (observe.js, pasted as `window.sbkObserve`) sees before
// the first step and after each. With `snapshot: true` it ends with a reference under its name.
//
// Actions Preview. Before and after each interaction or step the runner reads the payload Block Kit
// Builder's Actions Preview shows (`actions`, a function returning its text, overrides the reader);
// a new one is recorded for the interaction, and for each probe step.
//
// Each rest capture also records its controls' state styles (snapshot.js); `stateStyles: false`
// skips them.
//
// It resolves to `{ [name]: html }` for references, as before. Everything it recorded,
// `{ references, actions, behaviour }`, is kept on `window.sbkCaptureOutput`, and with
// `download: "<session>"` saved as `block-kit-refs-<session>.json` (`-partial` when the run stopped
// on an error) for `bun tools/visual/src/import.ts <file>`.
async ({
  items,
  snap,
  adapter,
  observe,
  actions: readActionsText,
  download,
  real = true,
  allowUrls = false,
  reset = false,
  stateStyles = true,
  settle = 1000,
  timeout = 120_000,
  viewport = 1440,
  substitute = {},
}) => {
  const win = window;
  const doc = document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // targets.ts, inlined (targets.test.ts keeps the selectors in step): the preview's controls by
  // address, `<kind>-<n>`, the nth outermost match of the kind's selector.
  const SLACK = {
    button:
      'button.c-button:not([aria-label="More options"]):not(.p-bkb_preview_modal__submit):not(.p-bkb_preview_modal__cancel):not(.c-fieldset > button)',
    overflow: 'button[aria-label="More options"]',
    field: '.c-select_input, [role="combobox"], .c-date_picker_input',
    checkbox: "input.c-input_checkbox",
    radio: "input.c-input_radio",
    input: 'input[class*="p-block_kit_"][class*="_input_element"], textarea[class*="p-block_kit_"]',
    submit: ".p-bkb_preview_modal__submit",
    cancel: ".p-bkb_preview_modal__cancel",
    link: "a.c-link.c-link--underline, .p-rich_text_section a.c-link",
    mention: '.c-member_slug, .c-mrkdwn__broadcast, .c-missing_text, [class*="c-missing_channel"]',
    card: '[class^="card__"], [class*=" card__"]',
    arrow: 'button[aria-label="Scroll left"], button[aria-label="Scroll right"]',
    menu: '[data-qa="more_attachment_actions"], [class*="chartActionsGroup"] .c-message_actions__button',
    column: '[role="columnheader"] button',
    page: '[data-qa^="c-pagination_"]',
    more: '.p-section_block [data-qa="show_more_button"], .p-section_block__show_more',
    action:
      '.c-message_actions__group:not([class*="chartActionsGroup"]) .c-message_actions__button',
    option: '.ReactModalPortal [role="option"]',
    menuitem: '.ReactModalPortal [role="menuitem"], .ReactModalPortal [role="menuitemradio"]',
    confirm: ".ReactModalPortal .c-dialog__go",
    deny: ".ReactModalPortal .c-dialog__cancel",
    richtext: '.ql-editor[role="textbox"]',
    file: ".p-block_kit_input_block .c-fieldset > button.c-button",
    icon: '[data-qa="bk_icon_button"]',
    feedback: '[data-qa^="bk_feedback_button_"]',
    collapse: '[data-qa="bk_container_block_header"]',
    pill: '[class*="toggleBarButton"]',
    task: '[class*="taskHeaderCollapsible"]',
    contact: '[data-qa="bk_contact_card_block"]',
    expand: '.c-expandable_trigger[aria-label="image"]',
    source: '[class*="listitem"] a.c-link:not(.c-link--underline), [class*="taskCard"] a.c-link',
    sender: ".p-bkb_preview__app_name",
    time: ".c-timestamp",
    scroller: "@scroller",
    video: ".p-video_overlay__button",
    tooltip: '[role="tooltip"], .c-tooltip',
    chip: ".c-token",
  };
  // Counted in the open layers, not the preview (targets.ts LAYER_KINDS).
  const LAYER_KINDS = ["option", "menuitem", "confirm", "deny", "tooltip"];
  const target = (address) => {
    const match = /^([a-z]+)-([1-9]\d*)$/.exec(address);
    return match && SLACK[match[1]] ? { kind: match[1], index: Number(match[2]) } : undefined;
  };
  const outermost = (els) => els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  // The scroller kind isn't a selector: a block that overflows the way it scrolls (targets.ts).
  const scrolls = (el) => {
    const cs = win.getComputedStyle(el);
    return (
      (/^(auto|scroll)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
      (/^(auto|scroll)$/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
    );
  };
  const controls = (root, kind) => {
    const scope = LAYER_KINDS.includes(kind) ? doc : root;
    if (SLACK[kind] === "@scroller")
      return outermost([...(scope?.querySelectorAll("*") ?? [])].filter(scrolls));
    return outermost([...(scope?.querySelectorAll(SLACK[kind]) ?? [])]);
  };
  const allControls = (root) =>
    Object.keys(SLACK).flatMap((kind) =>
      controls(root, kind).map((el, i) => ({ address: `${kind}-${i + 1}`, el })),
    );

  // names.ts, inlined: this file runs in the Builder without imports.
  const parse = (name) => {
    const [fixture, suffix] = name.split("@");
    const tokens = suffix ? suffix.split("+") : [];
    const interaction =
      tokens[0] && !["mobile", "full", "dark"].includes(tokens[0]) ? tokens[0] : undefined;
    const input = /^(hover|focus)-(.*)$/.exec(interaction ?? "");
    if (input && !target(input[2]))
      throw new Error(`${name}: ${input[2]} isn't a control address (targets.ts)`);
    const parsed = {
      fixture,
      interaction,
      theme: tokens.includes("dark") ? "dark" : "light",
      mobile: tokens.includes("mobile"),
      full: tokens.includes("full"),
    };
    const canonical = [
      interaction,
      parsed.mobile && "mobile",
      parsed.full && "full",
      parsed.theme === "dark" && "dark",
    ].filter(Boolean);
    if ((canonical.length ? `${fixture}@${canonical.join("+")}` : fixture) !== name)
      throw new Error(`${name} is not a canonical reference name (see names.ts)`);
    return parsed;
  };

  // A scripted press; React's menus listen for mousedown as well as click.
  // A real click also focuses what it lands on when mousedown isn't cancelled; a dispatched one
  // doesn't, and an open select then lacks the focus ring Slack draws around it.
  const FOCUSABLE =
    'input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]';
  const press = (el) => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: win });
      if (!el.dispatchEvent(event) || type !== "mousedown") continue;
      el.closest?.(FOCUSABLE)?.focus({ preventScroll: true });
    }
  };

  const PREVIEWS = ".p-bkb_preview__message, .p-bkb_preview_modal, .p-bkb_app_home";
  const preview = () => doc.querySelector(PREVIEWS);
  const popoverOpen = () =>
    [...doc.querySelectorAll(".ReactModalPortal .ReactModal__Content")].some(
      (c) => c.getBoundingClientRect().height > 0,
    );

  // The real Builder, as measured in it (October 2026): its JSON editor is a CodeMirror; the surface
  // and preview-size menus are comboboxes that only open on a key press (a scripted click is
  // ignored), listing `[role=option]` items; changing the surface can raise an "Are you sure?"
  // alertdialog; the theme toggle is labelled with the theme it switches to. A test passes a
  // stand-in.
  const pick = async (qa, label) => {
    const box = doc.querySelector(`[data-qa="${qa}"]`);
    if (!box) throw new Error(`the Builder has no ${qa}`);
    box.focus();
    box.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        keyCode: 40,
        bubbles: true,
        cancelable: true,
      }),
    );
    await sleep(500);
    const option = [...doc.querySelectorAll("[role=option]")].find((o) =>
      label.test(o.textContent.trim()),
    );
    if (!option) throw new Error(`no ${label} option in ${qa}`);
    press(option);
    await sleep(600);
    // Changing the surface asks before dropping blocks the new surface doesn't support.
    const sure = [
      ...doc.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button'),
    ].find((b) => b.textContent.trim() === "I’m Sure" || b.textContent.trim() === "I'm Sure");
    if (sure) {
      press(sure);
      await sleep(600);
    }
    return box.textContent.trim();
  };
  const builder = adapter ?? {
    async load(payload) {
      // The editor is the Payload tab's; Actions Preview shows its own CodeMirror in its place.
      await showTab("Payload");
      const cm = doc.querySelector(".CodeMirror").CodeMirror;
      const kind =
        payload.type === "modal" ? "modal" : payload.type === "home" ? "home" : "message";
      const LABEL = { message: /^Message/, modal: /^Modal/, home: /^App Home/ };
      const surface = () =>
        doc.querySelector('[data-qa="bkb-surface-select-button"]').textContent.trim();
      if (!LABEL[kind].test(surface())) {
        await pick("bkb-surface-select-button", LABEL[kind]);
        if (!LABEL[kind].test(surface())) throw new Error(`couldn't switch the Builder to ${kind}`);
      }
      cm.setValue(JSON.stringify(payload, null, 2));
    },
    // The toggle reads "Switch to dark mode" while the Builder is light.
    theme: () => (doc.querySelector('[aria-label="Switch to light mode"]') ? "dark" : "light"),
    async setTheme(theme) {
      doc.querySelector(`[aria-label="Switch to ${theme} mode"]`)?.click();
      await sleep(800);
    },
    previewSize: () =>
      doc.querySelector('[data-qa="bkb-preview-select-button"]')?.textContent.trim() === "Mobile"
        ? "mobile"
        : "desktop",
    async setPreviewSize(size) {
      await pick("bkb-preview-select-button", size === "mobile" ? /^Mobile$/ : /^Desktop$/);
      await sleep(400);
    },
  };

  // Waits until the preview's HTML stops changing and its images have loaded.
  const settled = async (before) => {
    let html = "";
    let since = 0;
    let t0 = performance.now();
    while (performance.now() - t0 < 60_000) {
      await sleep(Math.min(250, settle || 1));
      // macOS pauses a hidden tab; wait it out rather than time out.
      if (doc.visibilityState === "hidden") {
        t0 = performance.now();
        since = 0;
        continue;
      }
      const root = preview();
      const now = root ? root.innerHTML : "";
      if (!root || now === before || root.innerText.includes("switch")) continue;
      if (now !== html) {
        html = now;
        since = performance.now();
        continue;
      }
      if (
        performance.now() - since >= settle &&
        [...root.querySelectorAll("img")].every((i) => i.complete)
      )
        return;
    }
    throw new Error("the preview never settled");
  };

  const OPENERS = {
    open: '.c-select_input, [role="combobox"], .c-date_picker_input, button[aria-label="More options"]',
    confirm: "button.c-button, .c-button",
    dialog: '[class*="accessory"] .c-select_input, [class*="accessory"] [role="combobox"]',
  };
  const opened = (interaction) =>
    interaction === "open"
      ? popoverOpen()
      : !!doc.querySelector(
          '.ReactModalPortal [role="dialog"], .ReactModalPortal [role="alertdialog"]',
        );
  const waitFor = async (name, done) => {
    let t0 = performance.now();
    while (!done()) {
      // A hidden tab pauses the clock, as it pauses the page.
      if (doc.visibilityState === "hidden") t0 = performance.now();
      if (performance.now() - t0 > timeout)
        throw new Error(`${name}: timed out waiting for the interaction`);
      await sleep(250);
    }
  };

  // References are captured with the Builder's preview at its full width: a message 512px wide
  // (400px in the Mobile preview), a modal 520px, App Home 512px. A window a few pixels off 1440 still
  // gets those, but a narrower one (or DevTools' device mode) squeezes the preview, so each capture
  // is checked against them below rather than the window against an exact width.
  const PREVIEW_WIDTH = { message: 512, modal: 520, home: 512 };
  if (!adapter && viewport && win.innerWidth < viewport - 8)
    throw new Error(
      `make the window wider: the viewport is ${win.innerWidth}px, the preview needs about ${viewport}px`,
    );

  // Late in a long session the Builder can load a stylesheet that repeats rules it already has.
  // Repeating a rule moves it later in the cascade, so it can win where it lost on a fresh page:
  // `.c-date_time_picker { margin: 0 -8px }` came after `.p-block_kit_datetime_picker { margin: 0 }`
  // and shifted every datetime picker 8px. The page's own sheets are inventoried on the first call
  // (kept on the window, since a runner calls this once per item); a sheet that appears later may
  // add rules, and the rules it repeats are kept as suspects.
  //
  // A repeat only matters where it changes a style: rendering a chart, for one, loads a sheet that
  // repeats hundreds of the message chrome's rules on a fresh load. So before and after each
  // snapshot the suspects that match an element in the preview or an open layer are taken out for
  // a moment, the properties they set are read on those elements without them and with them, and
  // the capture stops only where a value differs: the cascade it would freeze isn't the one a
  // fresh page has. Transitions are off while reading, so the values are final.
  const ruleList = (rule) => rule.parentRule ?? rule.parentStyleSheet;
  const declarations = (sheet) => {
    const found = [];
    const walk = (rules, context) => {
      for (const rule of rules) {
        if (rule.selectorText !== undefined && rule.style)
          found.push({
            rule,
            keys: [...rule.style].map((p) => `${context}${rule.selectorText} { ${p}`),
          });
        else if (rule.cssRules) walk(rule.cssRules, `${context}@${rule.conditionText ?? ""} `);
      }
    };
    try {
      walk(sheet.cssRules, "");
    } catch {
      // A cross-origin sheet can't be read; there's nothing to compare.
    }
    return found;
  };
  const styles = (win.sbkCaptureStyles ??= { seen: new Set(), declared: new Set(), repeats: [] });
  styles.repeats ??= [];
  const inventory = () => {
    for (const sheet of doc.styleSheets) {
      if (styles.seen.has(sheet)) continue;
      const first = styles.seen.size === 0;
      styles.seen.add(sheet);
      const own = declarations(sheet);
      for (const { rule, keys } of own)
        if (!first && keys.some((k) => styles.declared.has(k)))
          styles.repeats.push({ rule, keys: keys.filter((k) => styles.declared.has(k)) });
      for (const { keys } of own) for (const k of keys) styles.declared.add(k);
    }
  };
  // The suspects that change a style in the preview or an open layer, as "selector { property:
  // fresh -> now }".
  const cascadeChanges = () => {
    inventory();
    const scopes = [preview(), ...doc.querySelectorAll(".ReactModalPortal")].filter(Boolean);
    const hits = [];
    for (const repeat of styles.repeats) {
      if (!ruleList(repeat.rule)) continue; // The sheet went away.
      const els = [];
      try {
        for (const scope of scopes) els.push(...scope.querySelectorAll(repeat.rule.selectorText));
      } catch {
        continue; // A selector querySelectorAll can't take (a pseudo-element) styles nothing here.
      }
      if (els.length > 0) hits.push({ repeat, els, props: [...repeat.rule.style] });
    }
    if (hits.length === 0) return [];
    const still = doc.createElement("style");
    still.textContent = "*,*::before,*::after{transition:none!important}";
    doc.head.append(still);
    const read = () =>
      hits.map(({ els, props }) =>
        els.map((el) => {
          const cs = win.getComputedStyle(el);
          return props.map((p) => cs.getPropertyValue(p));
        }),
      );
    const now = read();
    const taken = hits
      .map(({ repeat }) => {
        const list = ruleList(repeat.rule);
        return {
          repeat,
          list,
          index: [...list.cssRules].indexOf(repeat.rule),
          text: repeat.rule.cssText,
        };
      })
      .filter((t) => t.index >= 0);
    // Out last first so the indices hold, back in first first.
    for (const t of taken.toSorted((a, b) => b.index - a.index)) t.list.deleteRule(t.index);
    let fresh;
    try {
      fresh = read();
    } finally {
      for (const t of taken.toSorted((a, b) => a.index - b.index)) {
        t.list.insertRule(t.text, t.index);
        t.repeat.rule = t.list.cssRules[t.index];
      }
      still.remove();
    }
    const changes = [];
    hits.forEach(({ repeat, props }, h) =>
      now[h].forEach((values, e) =>
        values.forEach((value, p) => {
          if (value !== fresh[h][e][p])
            changes.push(
              `${repeat.rule.selectorText} { ${props[p]}: ${fresh[h][e][p]} -> ${value} }`,
            );
        }),
      ),
    );
    return [...new Set(changes)];
  };
  if (styles.seen.size === 0) {
    for (const sheet of doc.styleSheets) {
      styles.seen.add(sheet);
      for (const { keys } of declarations(sheet)) for (const k of keys) styles.declared.add(k);
    }
  }

  // Every occurrence of each placeholder, in any string in the payload.
  const swap = (payload) =>
    JSON.parse(
      Object.entries(substitute).reduce(
        (json, [from, to]) =>
          json.split(JSON.stringify(from).slice(1, -1)).join(JSON.stringify(to).slice(1, -1)),
        JSON.stringify(payload),
      ),
    );

  // Key order doesn't matter: the Builder re-serializes the payload into its URL.
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  const sameJson = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const shown = () => {
    try {
      return JSON.parse(decodeURIComponent(win.location.hash.slice(1)));
    } catch {
      return undefined;
    }
  };

  // The Actions Preview's payload, as text. In the Builder (as measured, October 2026) it's a tab
  // next to Payload (role=tab, text "Actions Preview") that must be selected to show; its content
  // is one CodeMirror (`.p-bkb_codemirror .react-codemirror2 .CodeMirror`) holding only the latest
  // payload, "{}" before the first. Without a reader (`actions`), the last CodeMirror or <pre> on
  // the page whose text is "{}" or parses to an interaction payload (`block_actions`,
  // `view_submission`, `view_closed`) is read.
  const PAYLOAD_TYPES = /^(block_actions|view_submission|view_closed|block_suggestion)$/;
  const isPayload = (text) => {
    try {
      return PAYLOAD_TYPES.test(JSON.parse(text ?? "")?.type ?? "");
    } catch {
      return false;
    }
  };
  const actionsText = () => {
    if (readActionsText) return readActionsText() ?? undefined;
    const texts = [
      ...[...doc.querySelectorAll(".CodeMirror")].map((el) => el.CodeMirror?.getValue?.()),
      ...[...doc.querySelectorAll("pre")].map((el) => el.textContent),
    ];
    return texts.findLast((text) => text?.trim() === "{}" || isPayload(text));
  };
  /** The payload that appeared since `before` (the text read then), or null. */
  // Actions Preview keeps the last payload until the next one, and one can land a moment late: the
  // previous item's can still arrive after this item started. So each item settles on a baseline
  // first (the text stops changing), and a payload counts only when it differs from the text
  // before its step and from that baseline.
  let stale;
  const settleActions = async () => {
    let last = actionsText();
    for (let waited = 0; waited < 3000; waited += 500) {
      await sleep(500);
      const now = actionsText();
      if (now === last) break;
      last = now;
    }
    stale = last;
    return last;
  };
  const newAction = async (before) => {
    // Actions Preview updates a moment after the interaction.
    for (let waited = 0; waited <= 2000; waited += 250) {
      const now = actionsText();
      if (now !== undefined && now !== before && now !== stale && isPayload(now))
        return JSON.parse(now);
      await sleep(250);
    }
    return null;
  };
  // Selects one of the Builder's right-pane tabs (none in a stand-in), and gives the focus back.
  async function showTab(label) {
    const tab = [...doc.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent.trim() === label,
    );
    if (!tab || tab.getAttribute("aria-selected") === "true") return;
    press(tab);
    await sleep(400);
    if (doc.activeElement === tab) tab.blur();
  }

  // A button or link with a `url` opens a new tab in the Builder. Nothing the capture clicks may
  // navigate: window.open is a no-op during a run, and a click on a link in the preview or a layer
  // has its default prevented (its handlers still run, so Actions Preview still gets the payload).
  const open = win.open;
  win.open = (url) => {
    console.log("capture.js kept a new tab from opening:", url);
    return null;
  };
  const noNavigation = (event) => {
    const link = event.target?.closest?.("a[href]");
    if (link && (preview()?.contains(link) || link.closest(".ReactModalPortal")))
      event.preventDefault();
  };
  win.addEventListener("click", noNavigation, true);

  // `+full`: widens the preview by the most any horizontal scroll container hides, then expands
  // any container that still overflows (one with a width of its own) to its content, through one
  // temporary stylesheet so the page's style attributes aren't touched. Returns what it did and how
  // to undo it.
  const FULL = "data-sbk-full";
  const overflowing = (root) =>
    outermost(
      [...(root?.querySelectorAll("*") ?? [])].filter(
        (el) =>
          /^(auto|scroll)$/.test(win.getComputedStyle(el).overflowX) &&
          el.scrollWidth > el.clientWidth + 1,
      ),
    );
  const widen = async () => {
    const root = preview();
    const hidden = overflowing(root);
    const widenedBy = Math.max(0, ...hidden.map((el) => el.scrollWidth - el.clientWidth));
    const style = doc.createElement("style");
    const undo = () => {
      style.remove();
      for (const el of doc.querySelectorAll(`[${FULL}]`)) el.removeAttribute(FULL);
    };
    if (widenedBy === 0) return { info: { widenedBy: 0, expanded: 0 }, undo };
    const width = root.getBoundingClientRect().width + widenedBy;
    root.setAttribute(FULL, "root");
    style.textContent = `[${FULL}="root"]{width:${width}px!important;min-width:${width}px!important;max-width:none!important;flex:none!important}`;
    doc.head.append(style);
    await sleep(Math.min(300, settle || 1));
    let expanded = 0;
    for (const el of overflowing(root)) {
      el.setAttribute(FULL, String(++expanded));
      style.textContent += `[${FULL}="${expanded}"]{width:${el.scrollWidth}px!important;max-width:none!important;overflow-x:visible!important;flex:none!important}`;
    }
    await sleep(Math.min(300, settle || 1));
    return { info: { widenedBy, expanded }, undo };
  };

  const center = (el) => {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
    };
  };
  // Trusted input since the runner started listening: the browser marks real input `isTrusted`.
  const trusted = [];
  const listen = (event) => {
    if (event.isTrusted) trusted.push(event);
  };
  for (const type of ["pointerdown", "mousedown", "click", "keydown"])
    win.addEventListener(type, listen, true);
  const ask = async (name, instruction, done) => {
    win.sbkCaptureReady = false;
    win.sbkCaptureWaiting = { name, ...instruction };
    console.log("sbkCaptureWaiting", JSON.stringify(win.sbkCaptureWaiting));
    await waitFor(name, done);
    win.sbkCaptureWaiting = undefined;
  };
  const focusable = (el) => (el.matches(FOCUSABLE) ? el : (el.querySelector(FOCUSABLE) ?? el));
  const focusVisible = (el) => {
    const active = doc.activeElement;
    return !!active && el.contains(active) && active.matches(":focus-visible");
  };

  // Holds real input on a control for a snapshot: the pointer on it, or keyboard focus.
  const hold = async (name, input, el, address) => {
    if (input === "hover") {
      await ask(name, { do: "hover", target: address, ...center(el) }, () => el.matches(":hover"));
      return () => el.matches(":hover");
    }
    // A scripted focus matches :focus-visible once the last input was a key press. Ask for one Tab
    // (anywhere) when it doesn't, then focus the control again. The pointer must be off it, or the
    // snapshot shows hover and focus together.
    if (el.matches(":hover"))
      await ask(name, { do: "move-away", target: address }, () => !el.matches(":hover"));
    focusable(el).focus({ preventScroll: true });
    if (!focusVisible(el)) {
      const since = trusted.length;
      await ask(name, { do: "key", key: "Tab", target: address, ...center(el) }, () =>
        trusted.slice(since).some((e) => e.type === "keydown" && e.key === "Tab"),
      );
      await sleep(50);
      focusable(el).focus({ preventScroll: true });
      if (!focusVisible(el))
        throw new Error(`${name}: ${address} took focus without :focus-visible after a Tab`);
    }
    return () => focusVisible(el) && !el.matches(":hover");
  };

  // A probe step's target: a control address, or `{ role, name }` anywhere in the preview and its
  // open layers (an option in an open list).
  const LAYERS = ".ReactModalPortal";
  const resolveStep = (spec) => {
    if (typeof spec === "string") {
      const t = target(spec);
      return t ? controls(preview(), t.kind)[t.index - 1] : undefined;
    }
    const scopes = [preview(), ...doc.querySelectorAll(LAYERS)].filter(Boolean);
    const text = (el) =>
      (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
    return scopes
      .flatMap((scope) => [...scope.querySelectorAll(roleSelector(spec.role))])
      .find((el) => el.getClientRects().length > 0 && text(el) === spec.name);
  };
  // A role written down, or the one an element has by its tag (probes.ts IMPLICIT_ROLES).
  const IMPLICIT_ROLES = {
    link: "a[href]",
    button: "button",
    checkbox: 'input[type="checkbox"]',
    radio: 'input[type="radio"]',
    textbox: 'textarea, input:not([type]), input[type="text"]',
  };
  const roleSelector = (role) =>
    [`[role="${role}"]`, IMPLICIT_ROLES[role]].filter(Boolean).join(", ");
  const describe = (spec) => (typeof spec === "string" ? spec : `${spec.role} "${spec.name}"`);
  const typeInto = (el, text) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    setter?.call(el, `${el.value ?? ""}${text}`);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  };
  const keyOf = (combo) => {
    const parts = combo.split("+");
    // Playwright's name for the space bar; the DOM's key is " ".
    const key = parts.at(-1) === "Space" ? " " : parts.at(-1);
    return { key, shiftKey: parts.includes("Shift"), altKey: parts.includes("Alt") };
  };
  const runStep = async (name, step, i, count) => {
    const where = { name, step: i + 1, of: count };
    if (step.wait !== undefined) return sleep(step.wait);
    // A block that scrolls itself, scrolled by script: a scroll needs no trusted input.
    if (step.scroll !== undefined) {
      const el = resolveStep(step.scroll);
      if (!el) throw new Error(`${name}: step ${i + 1} finds no ${describe(step.scroll)}`);
      const to = (value, max) => (value === "end" ? max : value);
      el.scrollTo({
        left: to(step.left ?? el.scrollLeft, el.scrollWidth),
        top: to(step.top ?? el.scrollTop, el.scrollHeight),
        behavior: "instant",
      });
      return;
    }
    if (step.key !== undefined) {
      const { key, ...modifiers } = keyOf(step.key);
      const since = trusted.length;
      if (!real) {
        const at = doc.activeElement ?? doc.body;
        for (const type of ["keydown", "keyup"])
          at.dispatchEvent(
            new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...modifiers }),
          );
        return;
      }
      return ask(name, { ...where, do: "key", key: step.key }, () =>
        trusted.slice(since).some((e) => e.type === "keydown" && e.key === key),
      );
    }
    if (step.type !== undefined) {
      const field = doc.activeElement;
      const before = field?.value ?? field?.textContent ?? "";
      if (!real && field) return typeInto(field, step.type);
      return ask(
        name,
        { ...where, do: "type", text: step.type },
        () =>
          `${doc.activeElement?.value ?? doc.activeElement?.textContent ?? ""}` ===
            `${before}${step.type}` || win.sbkCaptureReady,
      );
    }
    const spec = step.click ?? step.hover;
    const el = resolveStep(spec);
    if (!el) throw new Error(`${name}: step ${i + 1} finds no ${describe(spec)}`);
    const t = typeof spec === "string" ? target(spec) : undefined;
    if (step.click !== undefined && t?.kind === "button" && urlButtons[t.index - 1] && !allowUrls)
      throw new Error(
        `${name}: step ${i + 1} clicks ${spec}, a button with a url, which opens a tab; pass ` +
          "allowUrls: true to click it with window.open held off (only where capture.js runs in " +
          "the page's own world)",
      );
    if (step.hover !== undefined) {
      await ask(name, { ...where, do: "hover", target: describe(spec), ...center(el) }, () =>
        el.matches(":hover"),
      );
      return el;
    }
    if (!real) return press(el);
    const since = trusted.length;
    await ask(name, { ...where, do: "click", target: describe(spec), ...center(el) }, () =>
      // A list option can unmount on mousedown, before the click reaches it.
      trusted
        .slice(since)
        .some(
          (e) =>
            (e.type === "click" || e.type === "mousedown") &&
            (el.contains(e.target) || e.target === el),
        ),
    );
  };

  // Freezes the preview as the reference `refName`: waits for transitions, checks the cascade
  // hasn't been reordered and the held input still holds, widens it for `+full`, snapshots.
  const freezeAs = async (refName, { want, held, holds = () => true }) => {
    // Let transitions (80–160ms in Slack) finish before freezing the computed styles.
    await sleep(settle);
    const reordered = (when) => {
      const changes = cascadeChanges();
      if (changes.length > 0)
        throw new Error(
          `${refName}: ${when} the Builder loaded a stylesheet that repeats rules it already had, ` +
            `which changes ${changes.length} styles in the preview (${changes.slice(0, 3).join("; ")}); ` +
            "reload the Builder, paste snapshot.js and capture.js again, and resume",
        );
    };
    reordered("before the snapshot,");
    if (!holds()) throw new Error(`${refName}: the ${held.input} didn't hold until the snapshot`);
    const full = want.full ? await widen() : undefined;
    let html;
    try {
      html = await snap(win, {
        targets: allControls(preview()),
        // State facts are read at rest, at the preview's own width; a held state would be the
        // base they're measured from.
        stateStyles: stateStyles && !want.interaction && !want.full,
        ...(held && { input: held }),
        ...(full && { full: full.info }),
      });
    } finally {
      full?.undo();
    }
    html = html.replace(/ data-sbk-full="[^"]*"/g, "");
    // A sheet that arrived while the snapshot was taken (a chart's, as it rendered wider).
    reordered("while it snapshotted,");
    if (!holds())
      throw new Error(
        `${refName}: the ${held.input} was lost during the snapshot; hold it again and resume`,
      );
    if (!adapter) {
      const meta = JSON.parse(/id="sbk-reference-meta">(\{.*?\})</.exec(html)?.[1] ?? "{}");
      const expected = want.mobile ? 400 : PREVIEW_WIDTH[meta.surface];
      if (
        expected &&
        typeof meta.width === "number" &&
        meta.width !== expected &&
        !want.interaction &&
        !want.full
      )
        throw new Error(
          `${refName}: the Builder's preview is ${meta.width}px wide, not ${expected}px. The ` +
            "Builder remembers where its code and preview panes were split: run " +
            `localStorage.setItem("bkb_layout", JSON.stringify({ codePaneRatio: 0.5 })) and ` +
            "reload, keep the window 1440px wide (DevTools' device mode off), then capture again",
        );
    }
    references[refName] = html;
    recorded.references[refName] = html;
  };

  // Closes what an interaction opened, so the next item starts closed.
  const dismissAll = async () => {
    // Slack's confirm dialog ignores Escape; close it from its own Cancel (or Close) button.
    const dismiss = [...doc.querySelectorAll(".ReactModalPortal button")].find((b) =>
      /^(Cancel|Close)$/.test(b.textContent.trim() || b.getAttribute("aria-label") || ""),
    );
    if (dismiss) press(dismiss);
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    doc.activeElement?.dispatchEvent?.(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await sleep(Math.min(300, settle || 1));
  };

  // What this call captured, and everything since the page loaded or `sbkCaptureReset()`, for a
  // runner that calls this once per item and copies the output at the end. Starting over is a
  // call of its own, so a runner can't drop what it captured by passing an option every time.
  // Which of the payload's buttons, in document order (as `button-<n>` counts them), have a url.
  const buttonsWithUrls = (value, out = []) => {
    if (Array.isArray(value)) for (const v of value) buttonsWithUrls(v, out);
    else if (value && typeof value === "object") {
      if (value.type === "button" || value.type === "workflow_button") out.push(!!value.url);
      for (const v of Object.values(value)) if (v && typeof v === "object") buttonsWithUrls(v, out);
    }
    return out;
  };
  let urlButtons = [];

  const references = {};
  if (reset)
    throw new Error("capture.js no longer takes reset: true; call window.sbkCaptureReset() first");
  win.sbkCaptureReset = () => {
    win.sbkCaptureOutput = { references: {}, actions: {}, behaviour: {} };
  };
  if (!win.sbkCaptureOutput) win.sbkCaptureReset();
  const recorded = win.sbkCaptureOutput;
  // The clipboard has turned non-ASCII into "?" before; this JSON is pure ASCII.
  win.sbkCaptureJson = () =>
    JSON.stringify(win.sbkCaptureOutput).replace(
      /[\u0080-\uffff]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
  let failed = false;
  try {
    let previous = "";
    let previousPayload;
    for (const item of items) {
      const { name, payload, probe } = item;
      const want = parse(name);
      urlButtons = buttonsWithUrls(payload);
      // Without focus the Builder draws an open select without its focus ring, and a modal can be
      // frozen mid fade-in: started from DevTools in its own window, the page has neither. Wait for a
      // click into the page.
      if (!adapter && !doc.hasFocus()) {
        win.sbkCaptureWaiting = `${name}: click into the Builder page so it has focus`;
        console.log(win.sbkCaptureWaiting);
        await waitFor(name, () => doc.hasFocus());
        win.sbkCaptureWaiting = undefined;
      }
      if (builder.theme() !== want.theme) await builder.setTheme(want.theme);
      const size = want.mobile ? "mobile" : "desktop";
      // The Builder disables its preview-size menu for App Home and modals, which it previews only at
      // desktop width; a mobile name for one would capture the desktop preview.
      const desktopOnly = { home: "App Home", modal: "modals" }[payload?.type];
      if (want.mobile && desktopOnly)
        throw new Error(`${name}: the Builder previews ${desktopOnly} only at desktop width`);
      // Load first: it switches the surface, and App Home and modals disable the size menu, so a
      // mobile message right after a modal couldn't set its width the other way round.
      await builder.load(swap(payload));
      if (builder.previewSize() !== size) await builder.setPreviewSize(size);
      if (builder.previewSize() !== size)
        throw new Error(`${name}: the Builder's preview is ${builder.previewSize()}, not ${size}`);
      // The same payload again (another theme or width of it) can render the same HTML, so don't wait
      // for it to differ from the last capture.
      const same = JSON.stringify(payload) === previousPayload;
      if (!adapter) await settled(same ? undefined : previous);
      // Switching from a modal back to a message, the Builder has kept showing the modal: the
      // capture then froze the previous item under this name. Check the Builder's own record of
      // what it shows (its URL) against the payload, reload once if it differs, then give up.
      if (!adapter && !sameJson(shown(), swap(payload))) {
        await builder.load(swap(payload));
        await settled(previous);
        if (!sameJson(shown(), swap(payload)))
          throw new Error(`${name}: the Builder kept showing the previous payload`);
      }
      previousPayload = JSON.stringify(payload);

      const input = /^(hover|focus)-(.*)$/.exec(want.interaction ?? "");
      const actionKey = name.replace(/\+(mobile|full|dark)/g, "");
      // Only probes, submits and fixture-specific interactions send a payload; the others don't
      // switch to Actions Preview (selecting a tab takes the focus a held state needs).
      const sends =
        (!!probe && !item.snapshotOnly && want.theme !== "dark" && !want.mobile) ||
        want.interaction === "submit-errors" ||
        (!!want.interaction &&
          !input &&
          !OPENERS[want.interaction] &&
          want.interaction !== "scrolled-end");
      if (sends) await showTab("Actions Preview");
      const actionsBefore = sends ? await settleActions() : undefined;
      let holds = () => true;
      let held;
      if (probe) {
        if (!observe) throw new Error(`${name}: pass observe (observe.js) to record a probe`);
        // A probe run in another theme or width, or with `snapshotOnly`, only takes its
        // snapshots: its behaviour and payloads were recorded in light, at desktop width.
        const snapshotOnly = item.snapshotOnly || want.theme === "dark" || want.mobile;
        const steps = probe.steps ?? [];
        const observations = [observe(win, { side: "slack" })];
        const modifiers = name.split("@")[1].split("+").slice(1);
        let hovered;
        for (const [i, step] of steps.entries()) {
          const before = actionsText();
          if (step.snapshot !== undefined) {
            // A reference mid-probe, named after the step, with the item's theme and width; a
            // hover just before it is held through it.
            const el = hovered;
            await freezeAs([`${want.fixture}@${step.snapshot}`, ...modifiers].join("+"), {
              want: { ...want, interaction: step.snapshot },
              ...(el && {
                held: { input: "hover", target: describe(steps[i - 1].hover) },
                holds: () => el.matches(":hover"),
              }),
            });
          } else hovered = await runStep(name, step, i, steps.length);
          await sleep(Math.min(400, settle || 1));
          const action = snapshotOnly ? null : await newAction(before);
          observations.push({ ...observe(win, { side: "slack" }), action });
        }
        if (!snapshotOnly) recorded.behaviour[actionKey] = { steps, observations };
        // A probe that ends on a hover holds it through its snapshot.
        if (probe.snapshot && hovered) {
          const el = hovered;
          held = { input: "hover", target: describe(steps.at(-1).hover) };
          holds = () => el.matches(":hover");
        }
      } else if (input) {
        const t = target(input[2]);
        const el = controls(preview(), t.kind)[t.index - 1];
        if (!el) throw new Error(`${name}: the preview has no ${input[2]}`);
        holds = await hold(name, input[1], el, input[2]);
        held = { input: input[1], target: input[2] };
      } else if (want.interaction === "submit-errors") {
        const el = controls(preview(), "submit")[0];
        if (!el) throw new Error(`${name}: the preview has no modal submit button`);
        const html = preview().innerHTML;
        if (real) {
          const since = trusted.length;
          await ask(name, { do: "click", target: "submit-1", ...center(el) }, () =>
            trusted.slice(since).some((e) => e.type === "click" && el.contains(e.target)),
          );
        } else press(el);
        await sleep(Math.min(600, settle || 1));
        const action = await newAction(actionsBefore);
        recorded.behaviour[actionKey] = {
          steps: [{ click: "submit-1" }],
          observations: observe ? [{ ...observe(win, { side: "slack" }), action }] : [{ action }],
          changed: preview()?.innerHTML !== html,
        };
        held = { input: "submit", target: "submit-1" };
      } else if (want.interaction === "scrolled-end") {
        // The first horizontal scroll container that overflows, scrolled fully right.
        const [scroller] = overflowing(preview());
        if (!scroller) throw new Error(`${name}: nothing in the preview scrolls sideways`);
        scroller.scrollTo({ left: scroller.scrollWidth, behavior: "instant" });
        await sleep(Math.min(600, settle || 1));
      } else if (want.interaction && OPENERS[want.interaction]) {
        const opener = preview()?.querySelector(OPENERS[want.interaction]);
        if (opener) press(opener);
        await sleep(Math.min(600, settle || 1));
        if (!opened(want.interaction)) {
          win.sbkCaptureReady = false;
          win.sbkCaptureWaiting = name;
          await waitFor(name, () => opened(want.interaction) || win.sbkCaptureReady);
        }
      } else if (want.interaction) {
        win.sbkCaptureReady = false;
        win.sbkCaptureWaiting = name;
        await waitFor(name, () => win.sbkCaptureReady);
      }
      win.sbkCaptureWaiting = undefined;
      if (sends && !probe && want.interaction !== "submit-errors") {
        const action = await newAction(actionsBefore);
        if (action) recorded.actions[actionKey] = action;
      }
      if (probe && !probe.snapshot) {
        await dismissAll();
        continue;
      }
      await freezeAs(name, { want, held, holds });
      previous = preview()?.innerHTML ?? "";

      if (want.interaction) await dismissAll();
      if (input?.[1] === "focus") doc.activeElement?.blur?.();
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    win.open = open;
    win.removeEventListener("click", noNavigation, true);
    for (const type of ["pointerdown", "mousedown", "click", "keydown"])
      win.removeEventListener(type, listen, true);
    win.sbkCaptureWaiting = undefined;
    const count =
      Object.keys(references).length +
      Object.keys(recorded.actions).length +
      Object.keys(recorded.behaviour).length;
    if (download && count > 0) {
      const a = doc.createElement("a");
      a.href = URL.createObjectURL(new Blob([win.sbkCaptureJson()], { type: "application/json" }));
      a.download = `block-kit-refs-${download}${failed ? "-partial" : ""}.json`;
      doc.body.append(a);
      a.click();
      a.remove();
    }
  }
  return references;
};
