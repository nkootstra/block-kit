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
async ({ items, snap, adapter, settle = 1000, timeout = 120_000, viewport = 1440 }) => {
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

  // A scripted press; React's menus listen for mousedown as well as click.
  const press = (el) => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: win }));
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
    const t0 = performance.now();
    while (!done()) {
      if (performance.now() - t0 > timeout)
        throw new Error(`${name}: timed out waiting for the interaction`);
      await sleep(250);
    }
  };

  // References are captured at a 1440px viewport, where the message preview is 512px wide.
  if (!adapter && viewport && win.innerWidth !== viewport)
    throw new Error(
      `resize the window so the viewport is ${viewport}px wide (it's ${win.innerWidth})`,
    );

  const results = {};
  let previous = "";
  let previousPayload;
  for (const { name, payload } of items) {
    const want = parse(name);
    if (builder.theme() !== want.theme) await builder.setTheme(want.theme);
    const size = want.mobile ? "mobile" : "desktop";
    if (builder.previewSize() !== size) await builder.setPreviewSize(size);
    await builder.load(payload);
    // The same payload again (another theme or width of it) can render the same HTML, so don't wait
    // for it to differ from the last capture.
    const same = JSON.stringify(payload) === previousPayload;
    if (!adapter) await settled(same ? undefined : previous);
    previousPayload = JSON.stringify(payload);

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
