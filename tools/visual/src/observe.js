/* oxlint-disable no-unused-expressions -- this file is a bare function expression, evaluated in the page */
// What a behaviour probe records after each step (probes.ts), read the same way from Slack's preview
// in Block Kit Builder (pasted as `window.sbkObserve`, passed to capture.js as `observe`) and from
// our rendering (probes.ts evaluates this file with `side: "ours"`):
//
//   {
//     focus: { target, role, name, where } | null,   // the focused element; `where` is "preview",
//                                                    // "layer" (an open popover or dialog) or "page"
//     layers: [{ kind, role, scrollTop }],           // open popovers and dialogs, in page order
//     activeOption: "Bravo" | null,                  // the highlighted option or menu item's text
//     tooltip: "Copy link" | null,                   // a tooltip showing
//     busy: false,                                   // something loading (aria-busy, a spinner)
//     controls: { "field-1": { expanded: "true", value: "Medium" }, "checkbox-2": { checked: true } },
//   }
//
// Controls are addressed as in targets.ts (`<kind>-<n>`, outermost matches); targets.test.ts keeps
// the selectors here in step with it. It records roles, names and states, never Slack's markup. A
// name that shows a workspace member or channel is recorded as "<member>" or "<channel>", so the
// Builder's workspace never reaches a recording.
(win = window, { side = "slack" } = {}) => {
  const doc = win.document;
  const SIDES = {
    slack: {
      root: ".p-bkb_preview__message, .p-bkb_preview_modal, .p-bkb_app_home",
      popovers: ".ReactModalPortal .ReactModal__Content",
      dialogs: '[role="dialog"], [role="alertdialog"]',
      activeOption: ".c-select_options_list__option--active",
      kinds: {
        button:
          'button.c-button:not([aria-label="More options"]):not(.p-bkb_preview_modal__submit):not(.p-bkb_preview_modal__cancel):not(.c-fieldset > button):not(:has([data-qa="bk-multi_select_input"]))',
        overflow: 'button[aria-label="More options"]',
        field:
          '.c-select_input, [role="combobox"], .c-date_picker_input, button.c-button:has([data-qa="bk-multi_select_input"])',
        checkbox: "input.c-input_checkbox",
        radio: "input.c-input_radio",
        input:
          'input[class*="p-block_kit_"][class*="_input_element"], textarea[class*="p-block_kit_"], input[data-qa="block-kit-number-input-element"], input.c-input_text[type="email"], input.c-input_text[type="url"]',
        submit: ".p-bkb_preview_modal__submit",
        cancel: ".p-bkb_preview_modal__cancel",
        link: "a.c-link.c-link--underline, .p-rich_text_section a.c-link",
        mention:
          '.c-member_slug, .c-mrkdwn__broadcast, .c-missing_text, [class*="c-missing_channel"]',
        card: '[class^="card__"], [class*=" card__"]',
        arrow: 'button[aria-label="Scroll left"], button[aria-label="Scroll right"]',
        menu: '[data-qa="more_attachment_actions"], [class*="chartActionsGroup"] .c-message_actions__button',
        column: '[role="columnheader"] button',
        cell: '[class*="dataTableBlockCellWrapper"]',
        cellexpand: '[class*="dataTableBlockCellExpandButton"] button',
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
        source: '[data-qa="source"] a.c-link',
        sender: ".p-bkb_preview__app_name",
        time: ".c-timestamp",
        scroller: "@scroller",
        video: ".p-video_overlay__button",
        tooltip: '[role="tooltip"], .c-tooltip',
        chip: ".c-token",
      },
    },
    ours: {
      root: "#sbk-render",
      popovers: ".sbk-popover, .sbk-confirm, .sbk-select-dialog",
      dialogs: '[role="dialog"], [role="alertdialog"]',
      activeOption: "[data-active]",
      kinds: {
        button: ".sbk-button",
        overflow: ".sbk-overflow__button",
        field:
          ".sbk-select__control, .sbk-timepicker__control, .sbk-datepicker__input, .sbk-datetimepicker__control",
        checkbox: ".sbk-checkboxes__input",
        radio: ".sbk-radio-buttons__input",
        input: ".sbk-text-input",
        submit: ".sbk-modal__button--primary",
        cancel: ".sbk-modal__button--secondary",
        link: "a.sbk-link",
        mention:
          ".sbk-mention, .sbk-mention--broadcast, .sbk-mention--private, .sbk-mention--unresolved, .sbk-mention--missing",
        card: ".sbk-card",
        arrow:
          '.sbk-carousel button[aria-label="Scroll left"], .sbk-carousel button[aria-label="Scroll right"]',
        menu: ".sbk-hover-actions--image .sbk-hover-actions__menu-root > .sbk-hover-actions__button, .sbk-hover-actions--chart .sbk-hover-actions__menu-root > .sbk-hover-actions__button",
        column: ".sbk-data-table__col-header button",
        cell: ".sbk-data-table__cell",
        cellexpand: ".sbk-data-table__expand",
        page: ".sbk-data-table__pagination button",
        more: ".sbk-section__toggle",
        action: ".sbk-message-actions__button",
        option: '.sbk-popover [role="option"], .sbk-select-dialog [role="option"]',
        menuitem: '.sbk-popover [role="menuitem"], .sbk-popover [role="menuitemradio"]',
        confirm: ".sbk-confirm__button:not(.sbk-confirm__button--deny)",
        deny: ".sbk-confirm__button--deny",
        richtext: ".sbk-rich-text-input__editor",
        file: ".sbk-file-input__button",
        icon: '.sbk-icon-button:not([role="radio"])',
        feedback: ".sbk-feedback-buttons .sbk-icon-button",
        collapse: ".sbk-container__header--button",
        pill: ".sbk-plan__pill, button.sbk-task-card__pill",
        task: "button.sbk-plan__task-header",
        contact: ".sbk-contact-card",
        expand: ".sbk-image__toggle",
        source: ".sbk-plan__task-source-link, .sbk-task-card__source-link",
        sender: ".sbk-message__sender",
        time: ".sbk-message__time",
        scroller: "@scroller",
        video: "a.sbk-video__frame",
        tooltip: ".sbk-tooltip",
        chip: ".sbk-select__chip",
      },
    },
  };
  const at = SIDES[side];
  const root = doc.querySelector(at.root);
  const outermost = (els) => els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  // A layer's own box can be empty (ours is a positioned wrapper); it's open when anything in it
  // takes room.
  const shown = (el) =>
    [el, ...el.querySelectorAll("*")].some((n) => n.getBoundingClientRect().height > 0);
  const layers = outermost([...doc.querySelectorAll(at.popovers)]).filter(
    (el) => shown(el) && !root?.contains(el),
  );

  const clean = (text) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const PRIVATE = [
    ['[data-qa="member_name"], [data-qa*="member"] img, img[src*="slack-edge.com"]', "<member>"],
    [".c-channel_entity__name, [data-qa*='channel_entity']", "<channel>"],
  ];
  const text = (el) => {
    for (const [selector, placeholder] of PRIVATE)
      if (el.matches(selector) || el.querySelector(selector)) return placeholder;
    // What's hidden from assistive technology isn't the option's text (our typed-highlight
    // "Enter" keycap).
    if (el.querySelector('[aria-hidden="true"]')) {
      const copy = el.cloneNode(true);
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return clean(copy.textContent);
    }
    return clean(el.innerText ?? el.textContent);
  };
  const IMPLICIT = { button: "button", textarea: "textbox", select: "combobox", a: "link" };
  const INPUT_ROLES = { checkbox: "checkbox", radio: "radio", button: "button", submit: "button" };
  const roleOf = (el) =>
    el.getAttribute("role") ||
    (el.localName === "input"
      ? (INPUT_ROLES[el.type] ?? "textbox")
      : el.localName === "a" && !el.hasAttribute("href")
        ? null
        : (IMPLICIT[el.localName] ?? null));
  const nameOf = (el) => {
    const label = el.getAttribute("aria-label");
    if (label) return clean(label);
    const ids = el.getAttribute("aria-labelledby");
    if (ids)
      return clean(
        ids
          .split(/\s+/)
          .map((id) => doc.getElementById(id))
          .filter(Boolean)
          .map(text)
          .join(" "),
      );
    const wrapping = el.closest("label") ?? (el.id && doc.querySelector(`label[for="${el.id}"]`));
    if (wrapping && wrapping !== el) return text(wrapping);
    return text(el) || clean(el.getAttribute("placeholder"));
  };

  const controls = {};
  const addressOf = new Map();
  const scrolls = (el) => {
    const cs = win.getComputedStyle(el);
    return (
      (/^(auto|scroll)$/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
      (/^(auto|scroll)$/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
    );
  };
  // Counted in the open layers, not the message (targets.ts LAYER_KINDS).
  const LAYER_KINDS = ["option", "menuitem", "confirm", "deny", "tooltip"];
  for (const [kind, selector] of Object.entries(at.kinds)) {
    const scope = LAYER_KINDS.includes(kind) ? doc : root;
    // The scroller kind isn't a selector: a block that overflows the way it scrolls.
    const found = outermost(
      selector === "@scroller"
        ? [...(scope?.querySelectorAll("*") ?? [])].filter(scrolls)
        : [...(scope?.querySelectorAll(selector) ?? [])],
    );
    found.forEach((el, i) => {
      const address = `${kind}-${i + 1}`;
      addressOf.set(el, address);
      const state = {};
      const expanded =
        el.getAttribute("aria-expanded") ??
        el.querySelector("[aria-expanded]")?.getAttribute("aria-expanded");
      if (expanded != null) state.expanded = expanded;
      if (kind === "checkbox" || kind === "radio") state.checked = el.checked;
      if (kind === "input") state.value = el.value;
      if (kind === "field") {
        const field = el.matches("input") ? el : el.querySelector("input");
        // A select shows its choice in a layer over the input; its visible text is what counts.
        state.value = text(el) || clean(field?.value);
      }
      for (const [attr, name] of [
        ["aria-pressed", "pressed"],
        ["aria-current", "current"],
        ["aria-selected", "selected"],
        ["aria-disabled", "disabled"],
      ])
        if (el.hasAttribute(attr)) state[name] = el.getAttribute(attr);
      const sort = el.closest('[role="columnheader"]')?.getAttribute("aria-sort");
      if (sort) state.sort = sort;
      if (kind === "more") state.label = text(el);
      // How far a block that scrolls itself is scrolled, and how far it can go.
      if (kind === "scroller") {
        state.scrollLeft = Math.round(el.scrollLeft);
        state.scrollTop = Math.round(el.scrollTop);
        state.scrollWidth = el.scrollWidth;
        state.clientWidth = el.clientWidth;
      }
      // Only controls that report a state: a link or a card says nothing until it has focus.
      if (Object.keys(state).length > 0) controls[address] = state;
    });
  }

  const active = doc.activeElement;
  let focus = null;
  if (active && active !== doc.body && active !== doc.documentElement) {
    let address = null;
    for (const [el, a] of addressOf) if (el === active || el.contains(active)) address = a;
    focus = {
      target: address,
      role: roleOf(active),
      name: nameOf(active),
      where: root?.contains(active)
        ? "preview"
        : layers.some((l) => l.contains(active))
          ? "layer"
          : "page",
    };
  }

  const owner = [
    active,
    ...layers.flatMap((l) => [...l.querySelectorAll("[aria-activedescendant]")]),
  ]
    .filter(Boolean)
    .find((el) => el.getAttribute?.("aria-activedescendant"));
  const highlighted =
    (owner && doc.getElementById(owner.getAttribute("aria-activedescendant"))) ||
    (active?.matches?.('[role="option"], [role="menuitem"]') ? active : null) ||
    layers.map((l) => l.querySelector(at.activeOption)).find(Boolean) ||
    null;

  const ROLES =
    '[role="listbox"], [role="menu"], [role="grid"], [role="dialog"], [role="alertdialog"]';
  return {
    focus,
    layers: layers.map((layer) => {
      const dialog = layer.matches(at.dialogs) || !!layer.querySelector(at.dialogs);
      const roleEl = layer.matches(ROLES) ? layer : layer.querySelector(ROLES);
      const scroller = [layer, ...layer.querySelectorAll("*")].find(
        (el) =>
          el.scrollHeight > el.clientHeight + 1 &&
          /(auto|scroll)/.test(win.getComputedStyle(el).overflowY),
      );
      return {
        kind: dialog ? "dialog" : "popover",
        role: roleEl?.getAttribute("role") ?? null,
        scrollTop: Math.round(scroller?.scrollTop ?? 0),
      };
    }),
    activeOption: highlighted ? text(highlighted) : null,
    // A tooltip showing (after a hover and its delay), and whether anything is loading.
    tooltip: (() => {
      const tip = [...doc.querySelectorAll('[role="tooltip"], .c-tooltip')].find((el) => shown(el));
      return tip ? text(tip) : null;
    })(),
    busy:
      !!root?.querySelector('[aria-busy="true"], [class*="spinner"]') ||
      layers.some((l) => l.querySelector('[aria-busy="true"], [class*="spinner"]')),
    controls,
  };
};
