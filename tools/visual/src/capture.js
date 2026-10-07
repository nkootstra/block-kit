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
async ({ items, snap, adapter, settle = 1000, timeout = 120_000 }) => {
  const win = window;
  const doc = document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // names.ts, inlined: this file runs in the Builder without imports.
  const parse = (name) => {
    const [fixture, suffix] = name.split("@");
    const tokens = suffix ? suffix.split("+") : [];
    const interaction =
      tokens[0] && !["mobile", "dark"].includes(tokens[0]) ? tokens[0] : undefined;
    const parsed = {
      fixture,
      interaction,
      theme: tokens.includes("dark") ? "dark" : "light",
      mobile: tokens.includes("mobile"),
    };
    const canonical = [
      interaction,
      parsed.mobile && "mobile",
      parsed.theme === "dark" && "dark",
    ].filter(Boolean);
    if ((canonical.length ? `${fixture}@${canonical.join("+")}` : fixture) !== name)
      throw new Error(`${name} is not a canonical reference name (see names.ts)`);
    return parsed;
  };

  const PREVIEWS = ".p-bkb_preview__message, .p-bkb_preview_modal, .p-bkb_app_home";
  const preview = () => doc.querySelector(PREVIEWS);
  const popoverOpen = () =>
    [...doc.querySelectorAll(".ReactModalPortal .ReactModal__Content")].some(
      (c) => c.getBoundingClientRect().height > 0,
    );

  // The real Builder, as measured in it: its JSON editor is a CodeMirror, the surface switch only
  // takes a payload valid for the target surface, and the theme and preview-size controls sit in
  // its header. A test passes a stand-in.
  const builder = adapter ?? {
    async load(payload) {
      const cm = doc.querySelector(".CodeMirror").CodeMirror;
      const kind =
        payload.type === "modal" ? "modal" : payload.type === "home" ? "home" : "message";
      const LABEL = { message: /^Message/, modal: /^Modal/, home: /^App Home/ };
      const NEUTRAL = {
        message: { blocks: [{ type: "section", text: { type: "mrkdwn", text: "switch" } }] },
        modal: {
          type: "modal",
          title: { type: "plain_text", text: "switch" },
          blocks: [{ type: "section", text: { type: "mrkdwn", text: "switch" } }],
        },
        home: {
          type: "home",
          blocks: [{ type: "section", text: { type: "mrkdwn", text: "switch" } }],
        },
      };
      const button = () => doc.querySelector('[data-qa="bkb-surface-select-button"]');
      if (!LABEL[kind].test(button().textContent.trim())) {
        cm.setValue(JSON.stringify(NEUTRAL[kind], null, 2));
        await sleep(1200);
        for (let i = 0; i < 3 && !LABEL[kind].test(button().textContent.trim()); i++) {
          button().click();
          await sleep(600);
          [...doc.querySelectorAll("[role=option]")]
            .find((o) => LABEL[kind].test(o.textContent.trim()))
            ?.click();
          await sleep(900);
        }
        if (!LABEL[kind].test(button().textContent.trim()))
          throw new Error(`couldn't switch the Builder to ${kind}`);
      }
      cm.setValue(JSON.stringify(payload, null, 2));
    },
    theme: () =>
      /sk-client-theme--dark/.test(`${doc.documentElement.className} ${doc.body.className}`)
        ? "dark"
        : "light",
    async setTheme(theme) {
      doc.querySelector(`[aria-label="Switch to ${theme} mode"]`)?.click();
      await sleep(800);
    },
    // The size menu next to the surface menu reads "Desktop" or "Mobile".
    previewSize: () =>
      [...doc.querySelectorAll("button, [role=button]")].some(
        (b) => b.textContent.trim() === "Mobile",
      )
        ? "mobile"
        : "desktop",
    async setPreviewSize(size) {
      const label = size === "mobile" ? "Mobile" : "Desktop";
      const other = size === "mobile" ? "Desktop" : "Mobile";
      [...doc.querySelectorAll("button, [role=button]")]
        .find((b) => b.textContent.trim() === other)
        ?.click();
      await sleep(500);
      [...doc.querySelectorAll("[role=option], [role=menuitem], button")]
        .find((o) => o.textContent.trim() === label)
        ?.click();
      await sleep(800);
    },
  };

  // Waits until the preview's HTML stops changing and its images have loaded.
  const settled = async (before) => {
    let html = "";
    let since = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 60_000) {
      await sleep(Math.min(250, settle || 1));
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

  // A scripted press; React's menus listen for mousedown as well as click.
  const press = (el) => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: win }));
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
    const t0 = performance.now();
    while (!done()) {
      if (performance.now() - t0 > timeout)
        throw new Error(`${name}: timed out waiting for the interaction`);
      await sleep(250);
    }
  };

  const results = {};
  let previous = "";
  for (const { name, payload } of items) {
    const want = parse(name);
    if (builder.theme() !== want.theme) await builder.setTheme(want.theme);
    const size = want.mobile ? "mobile" : "desktop";
    if (builder.previewSize() !== size) await builder.setPreviewSize(size);
    await builder.load(payload);
    if (!adapter) await settled(previous);

    if (want.interaction && OPENERS[want.interaction]) {
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
    // Let transitions (80–160ms in Slack) finish before freezing the computed styles.
    await sleep(settle);
    results[name] = await snap(win);
    previous = preview()?.innerHTML ?? "";

    if (want.interaction) {
      doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      doc.activeElement?.dispatchEvent?.(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await sleep(Math.min(300, settle || 1));
    }
  }
  return results;
};
