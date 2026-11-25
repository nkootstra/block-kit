/**
 * Package bugs and harness gaps noticed while gathering the inventory's facts. The maintainer
 * wants every fact gathered before anything is fixed, so they're recorded here, printed in
 * inventory.md under "Findings (to fix later)", and fixed afterwards.
 */
export interface Finding {
  id: string;
  title: string;
  /** What fails or looks wrong, and how it shows. */
  evidence: string[];
  /** Where the cause probably is. */
  suspect: string[];
  /** What would settle it. */
  next: string;
  components: string[];
  /** `verified`: a capture showed it isn't a gap after all. Open otherwise. */
  status?: "verified";
}

export const FINDINGS: Finding[] = [
  {
    id: "rich-text-unknown-inline",
    title: "An unknown rich text element renders nothing",
    evidence: [
      "Every documented inline element now draws as Slack's references show it (tag, citation, canvas, file, the mentions…). A type outside that list still falls to the inline switch's default and renders nothing, where an unknown block or element shows the visible Unsupported placeholder.",
    ],
    suspect: [
      "packages/block-kit/src/blocks/RichText.tsx, the default case of the inline element switch.",
    ],
    next: "Find what Slack draws for an inline element type it doesn't know (the Builder may refuse the payload), then match it or show Unsupported.",
    components: ["rich_text"],
  },
  {
    id: "icon-button-icons",
    title: "Icon buttons: Slack offers only trash; ours draws ten names",
    evidence: [
      "The icon button reference says trash is the only icon available, and Block Kit Builder refused extra/fidelity/icon-button/mixed for its calendar and link icons. IconButton.tsx maps about ten names and falls back to a kebab glyph; only trash is a Slack fact. The Slack icon object (cards) is a separate set of about 55 names.",
    ],
    suspect: [
      "packages/block-kit/src/elements/IconButton.tsx, the ICONS map: the names beyond trash aren't Slack's.",
    ],
    next: "Capture extra/fidelity/icon-button/mixed (now two trash buttons, one with a confirm) and the slack-icon fixtures.",
    components: ["icon_button", "slack_icon"],
  },
  {
    id: "chart-mobile-scroll",
    title:
      "To verify: our chart card keeps 400px and scrolls sideways on a narrow width, as Slack's does",
    evidence: [
      "In the Builder's mobile preview Slack's data_visualization card has a 400px minimum width inside a horizontal scroll container (overflow-x: auto, 320px visible): on mobile, Slack's charts scroll sideways.",
      "Ours declares the same (DataVisualization.css: min-width 400px on the card, a scroller with overflow auto and max-width 100%), and the interaction test \"keeps a chart card 400px wide in a narrow message and scrolls it sideways\" checks the geometry. The compare render clipped ours at the same edge as Slack's; whether ours actually scrolls to the same end isn't checked against Slack yet.",
    ],
    suspect: ["Nothing yet: the scrolled-end capture will tell."],
    next: "Done: catalog/data-visualization/bar-single-series@mobile+full (0.08%) and @scrolled-end+mobile (0.00%) match, so our chart scrolls like Slack's.",
    components: ["data_visualization"],
    status: "verified",
  },
  {
    id: "stale-short-leftovers",
    title: "references:check misses a refused payload whose leftover text is short",
    evidence: [
      'extra/fidelity/confirm/long-content@mobile+dark was captured after the Builder refused the payload (confirm text over 300 characters) and kept the previous one, a rich text list. references:check passed it: stale.ts only compares sentences of four words or more, every leftover line ("Hey", "First", "Quoted text") was shorter, and the confirm\'s own text is exempt because it waits for a click.',
    ],
    suspect: [
      "tools/visual/src/stale.ts: foreignText's four-word threshold and missingText's confirm exemption.",
    ],
    next: "The limits check (limits.ts) now stops such payloads before capture; stale.ts could also compare the reference's payload meta against the Builder's preview hash.",
    components: ["confirm"],
  },
  {
    id: "validation-unverifiable-in-builder",
    title: "Our modal validation errors can't be checked against the Builder",
    evidence: [
      "Verification session: Block Kit Builder doesn't validate a modal. extra/modal/required-multi-selects@submit-errors with every required field empty sent a view_submission straight to Actions Preview and showed no errors.",
      "Ours shows the errors (640px against Slack's 563px on that fixture). Whether, where and how the real Slack client shows them can only be captured from the client, not the Builder.",
    ],
    suspect: [
      "packages/block-kit/src/validation.ts and the input error rendering: unverified, not known wrong.",
    ],
    next: "Capture a modal's validation from the real Slack client, or keep the errors as they are until one exists. The inventory marks validation-error cells unobservable in the Builder.",
    components: ["input", "modal-frame"],
  },
  {
    id: "typed-select-keyboard",
    title: "A typed-into select's arrow keys, outside click and field value differ from Slack's",
    evidence: [
      "Probe contexts/static_select/accessory@scroll-field-1 (16 October 2026): Slack's ArrowDown runs Option 1, 2, 3 and then back to no highlight (the field) before Option 1 again; ours wraps from Option 3 straight to Option 1.",
      "Probe extra/payloads/selects@outside-click: with the first select open, a click on the second only closes the first in Slack; ours opens the second.",
      'Every typed-into select probe: Slack keeps the input empty while its value layer shows the choice (field-1.value ""); ours keeps the chosen label in the input, transparent behind the layer.',
    ],
    suspect: [
      "packages/block-kit/src/elements/useMenuNavigation.ts: a no-highlight step at the end of the cycle for typed-into lists.",
      "packages/block-kit/src/elements/Popover.tsx and Select.tsx: whether the click that dismisses an open list also reaches the control under it, and the input's value while the overlay shows.",
    ],
    next: "Replay the probes on ours (bun tools/visual/src/probes.ts contexts/static_select extra/payloads/selects) after a fix; the external select probes will show whether it shares each one.",
    components: ["static_select", "external_select", "option"],
  },
  {
    id: "builder-carries-element-state",
    title:
      "Block Kit Builder keeps an element's state across payloads with the same block and action IDs",
    evidence: [
      'Light desktop chunks: a value from one payload (the "Red" chip of extra/fidelity/multi-static-select/initial-value, a radio choice, a placeholder) showed in the next payloads with the same block_id and action_id. Contaminated references were dropped: multi-static-select/many-items and /mixed, radio-buttons/mixed.',
      'Not contamination: extra/fidelity/multi-users-select/initial-value showed "chips: 2, expected 1" because the chip check matched the user chip\'s avatar (class c-token--member) as a second chip. It has one chip, as its payload sets; the check now matches the c-token class itself.',
    ],
    suspect: [
      "Not a package bug: a capture hazard. The fidelity fixtures without a reference now carry unique block and action IDs; fixtures that share IDs and already have references (contexts, catalog) can still carry state into each other.",
    ],
    next: "The harness could load an empty payload between items, or check each reference's selected values against its payload.",
    components: ["multi_static_select", "radio_buttons"],
    status: "verified",
  },
  {
    id: "input-block-dispatch",
    title:
      "Block Kit Builder sends block_actions from an input block's element without dispatch_action",
    evidence: [
      'catalog/input/radio-buttons@pick and catalog/container/data-entry-form@pick (light desktop retry), catalog/input/static-select@pick (dark desktop session): picking a radio or a static select option in an input block without dispatch_action made Actions Preview show a block_actions payload (selected "*plain_text option 1*", "High").',
      "Modal light sitting: the same in a modal's input blocks (extra/modal/required-multi-selects@pick, contexts/multi_static_select/modal-input@add-remove), so it isn't specific to messages.",
      "Ours sends nothing there, on purpose: Slack's docs say an input block's element dispatches only with dispatch_action (context.tsx, blocks/Input.tsx). Listed in actionPayloads.test.tsx KNOWN_UNSENT.",
    ],
    suspect: [
      "Either Block Kit Builder simulates a payload real Slack wouldn't send, or real Slack does send it in messages. Ours: packages/block-kit/src/blocks/Input.tsx (`__dispatchAction`).",
    ],
    next: "Check a real app's message with an input block (no dispatch_action) before changing ours; then either keep the KNOWN_UNSENT entries as a Builder quirk or dispatch.",
    components: ["input", "radio_buttons", "static_select"],
  },
  {
    id: "datepicker-calendar-keyboard",
    title:
      "How Slack's open calendar is reached by keyboard isn't recorded; ours moves in on ArrowDown",
    evidence: [
      "contexts/datepicker/actions@keyboard and contexts/datetimepicker/actions@keyboard: after a press on the date field, Slack's calendar is open with focus left in the field, and ArrowRight, ArrowDown and Enter there change nothing. Ours now leaves focus in the field on a press too.",
      "Ours moves into the calendar on ArrowDown, a shortcut the docs list as ours. No recording shows how Slack's grid is reached from the keyboard.",
      'Slack\'s calendar is a popover holding a grid; ours is a dialog (role "dialog"), the WAI-ARIA date picker pattern.',
    ],
    suspect: [
      "packages/block-kit/src/elements/DateField.tsx: ArrowDown moves focus to the selected day.",
    ],
    next: "Record a probe that Tabs from Slack's open-calendar field (click field-1, Tab, Tab) to see whether the grid takes focus, then match it.",
    components: ["datetimepicker", "datepicker"],
  },
  {
    id: "builder-contact-card",
    title: "Block Kit Builder doesn't reliably draw a contact card for a placeholder user",
    evidence: [
      "catalog/callout/callout: the references of 7 and 8 October draw its contact_card (U0123456789, shown as an unknown member); @mobile (7 October) and @focus-menu-1 (12 October) have none, 35px shorter. extra/fidelity/contact-card/mixed (12 October) draws one of its two cards.",
      "Light desktop retry: callout@hover-contact-1 and @poke-contact-1 found no contact card within 5 s of the preview settling.",
    ],
    suspect: [
      "Not a harness or package bug: the Builder looks the user up, and a user outside the workspace renders only sometimes. A real member would render but put private data in the capture.",
    ],
    next: "Plan no real input on contact cards (plan.ts NOT_DRAWN; the callout@poke-contact-1 probe is gone). If a capture is wanted, find a redaction-safe way to show a card, then drop NOT_DRAWN.",
    components: ["contact_card"],
    status: "verified",
  },
  {
    id: "builder-condition-desktop",
    title: "Block Kit Builder's Mobile preview still renders a condition block's desktop branch",
    evidence: [
      'Light mobile session: catalog/condition/client-platforms@mobile shows the client = desktop case ("Desktop branch"), as the desktop preview does. The Builder evaluates conditions as the desktop client at either width.',
      "Ours does the same on purpose: packages/block-kit/src/blocks/Condition.tsx always matches the desktop client.",
    ],
    suspect: [
      "Not a bug: a Builder limit. The ios, android and mobile branches can't be captured in the Builder; only the real mobile clients show them.",
    ],
    next: "Keep the desktop-only evaluation until a real mobile client can be captured; the mobile references of condition fixtures show the desktop branch at 400px.",
    components: ["condition"],
    status: "verified",
  },
  {
    id: "mobile-nothing-scrolls",
    title:
      "At the mobile width, tables, preformatted rich text and markdown code fit without scrolling",
    evidence: [
      'Light mobile session: catalog/rich-text/kitchen-sink, catalog/markdown/code, catalog/table/simple-table and extra/fidelity/table/many-items and /mixed stopped @scrolled-end+mobile with "nothing in the preview scrolls sideways". Their @mobile+full references widened nothing (widenedBy 0); the tables\' scroll containers are 320px wide with 320px of content.',
      "Ours at a 400px viewport: no horizontal scroll container overflows in any of the five.",
    ],
    suspect: ["Not a bug: Slack and ours both wrap or shrink these to the mobile width."],
    next: "The plan skips @scrolled-end where a fixture's references at that width measured nothing overflowing (plan.ts fitsAt).",
    components: ["table", "rich_text", "markdown"],
    status: "verified",
  },
  {
    id: "mobile-carousel-arrow",
    title: "In the Builder's Mobile preview a click on a carousel's next arrow didn't scroll it",
    evidence: [
      "Light mobile session: a real click on catalog/card-and-carousel/carousel's Scroll right arrow left the carousel where it was; a horizontal wheel scroll moved it, and then the Scroll left arrow appeared. On desktop the same click scrolls (carousel@poke-arrow-2). The mobile reference draws both arrows as desktop does (the left one with p-gallery_scroller__arrow--hidden).",
    ],
    suspect: [
      "Unknown: the Builder's Mobile preview may treat the arrows differently (touch-first), or the click missed a hit area. Ours scrolls on an arrow click at any width (blocks/Carousel.tsx).",
    ],
    next: "Retry the click at the arrow's centre in the Mobile preview; if it still doesn't scroll, decide whether ours should hide or ignore the arrows at the mobile width.",
    components: ["carousel"],
  },
  {
    id: "mobile-multi-select-escape",
    title:
      "At the mobile width, Escape didn't close an input block's open multi-select list after a pick",
    evidence: [
      "Light mobile session, catalog/input/multi-static-select: after a click on an option the list stayed open (as on desktop), and Escape left it open; a click outside closed it.",
    ],
    suspect: [
      "Unknown whether it's the width or the click moving focus out of the field (Escape goes to whatever has focus). Ours closes the list on Escape from the field (elements/useCombobox.ts).",
    ],
    next: "A probe (click field-1, click option-1, Escape) at desktop would separate the two; probes record at desktop width only.",
    components: ["multi_static_select"],
  },
  {
    id: "input-block-label-name",
    title:
      "Slack's recordings of multi-selects in an input block name them by placeholder; a browser names them by the block's label",
    evidence: [
      "Our selects in an input block are now named by the block's label (aria-labelledby), as Slack's are. The single select recordings match: contexts/{static,users,conversations,channels}_select/modal-input@submit.",
      'Slack\'s multi-select field carries aria-labelledby (the block\'s label, present in the reference) and aria-label (the placeholder). The accessible name is the label, but these recordings were made when observe.js read aria-label first, so they say "Select items", "Pick some", "Search tags" or "Select options" where ours now reads the label: contexts/multi_static_select/modal-input@add-remove and @submit, extra/fidelity/multi-external-select/empty@poke-field-1, extra/fidelity/multi-static-select/many-items@scroll-field-1, extra/modal/required-multi-selects@fill-one-submit, and for the users, conversations and channels multi-selects contexts/multi_users_select/modal-input@submit, extra/modal/optional-inputs@submit and extra/fidelity/multi-channels-select/empty@poke-field-1.',
    ],
    suspect: [
      "Not a package bug: the recordings predate observe.js reading aria-labelledby first.",
    ],
    next: "Re-record those eight behaviour recordings with the current observe.js; their focus.name lines should then match.",
    components: [
      "input",
      "multi_static_select",
      "multi_external_select",
      "multi_users_select",
      "multi_conversations_select",
      "multi_channels_select",
    ],
  },
  {
    id: "builder-modal-block-options",
    title: "Block Kit Builder's modal preview puts a block options button in the Tab order",
    evidence: [
      'Modal light sitting, extra/modal/form@tab: in Slack every other Tab lands on a Builder button named "Input with plain_text_input block options" (tooltip "Click for options"), between the controls. It is the Builder\'s editing chrome, not Slack\'s modal.',
    ],
    suspect: [
      "Not a package or harness bug: the Builder preview. Keyboard order in a Builder modal can't be compared one to one with ours.",
    ],
    next: 'Compare Tab order ignoring focus targets named "… block options" (observe.js could leave them out), or capture Tab order from a real modal.',
    components: ["modal-frame", "input"],
    status: "verified",
  },
  {
    id: "file-input-slack-dialog",
    title:
      "Slack's file input opens its own Add file dialog and shows a sharing tooltip; ours focuses a native file input",
    evidence: [
      'Modal light sitting, contexts/file_input/modal-input@poke-file-1: hovering the button shows a tooltip ("The people who can edit this automation will also have access to any files share…"), and the click opens Slack\'s "Add file" dialog (focus moves to role dialog, outside the preview). Ours shows no tooltip and focuses its file input ("Upload File").',
      "capture.js now keeps the operating system's file picker from opening during a run (a real click on a file input or its label, input.click(), showPicker()).",
    ],
    suspect: [
      "packages/block-kit/src/elements/FileInput.tsx: ours opens the browser's file picker. The tooltip's wording comes from workflow-builder context, so it may be the Builder's.",
    ],
    next: "Decide whether ours should offer a dialog like Slack's or keep the native picker; record what a real modal does.",
    components: ["file_input"],
  },
  {
    id: "multi-select-modal-keyboard",
    title: "After Enter picks an option, Slack's multi-select clears its highlight; ours keeps it",
    evidence: [
      "Modal light sitting, contexts/multi_static_select/modal-input@add-remove (click field-1, Enter, ArrowDown, Enter, Escape, Backspace), replayed on ours: both fields are typed-into comboboxes, Enter after opening keeps the list open, ArrowDown highlights Option 1 and Enter picks it with the list left open. Then Slack highlights nothing; ours still highlights Option 1.",
      "Slack's users, conversations and channels multi-selects are the same field, and so are ours (contexts/multi_users_select/modal-input@submit, extra/modal/optional-inputs@submit, extra/fidelity/multi-channels-select/empty@poke-field-1).",
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.tsx / useCombobox.ts: a pick in a multi-select leaves the active row as it was.",
    ],
    next: "Clear the highlight after a pick in a multi-select, then replay bun tools/visual/src/probes.ts contexts/multi_static_select/modal-input.",
    components: [
      "multi_static_select",
      "multi_users_select",
      "multi_conversations_select",
      "multi_channels_select",
    ],
  },
  {
    id: "builder-modal-focus-on-load",
    title:
      "Block Kit Builder's modal preview didn't honour focus_on_load; ours focuses the element",
    evidence: [
      "Modal light sitting, extra/modal/dispatch-rich-text@type: the rich text input has focus_on_load: true. In the Builder nothing had focus before the first step; ours focuses richtext-1 on load.",
    ],
    suspect: [
      "Probably the Builder (its preview isn't a real modal opening), so not a package bug; Slack's docs say the element is focused when the view opens.",
    ],
    next: "Check a real modal with focus_on_load before changing ours.",
    components: ["rich_text_input"],
  },
  {
    id: "replay-observation-noise",
    title: "Modal replays: differences that are how the two sides are observed, not behaviour",
    evidence: [
      'Modal light sitting replay: Slack\'s typeable fields report disabled "false" and no expanded state at rest, ours the reverse; a typeable field\'s value is "" in Slack where ours reports its placeholder ("Select items", "Search"); Slack\'s virtualised time list renders fewer options than ours (option-20…24 missing on Slack\'s side); the modal\'s scroll container is 508px in the Builder against 516 in ours (the Builder\'s modal body keeps an 8px scrollbar).',
      'Our typed-highlight "Enter" keycap made the active option read "Option 1 Enter"; observe.js now leaves aria-hidden text out.',
    ],
    suspect: ["tools/visual/src/observe.js: how each side's state is read."],
    next: "Normalize these in observe.js or diffObservations when they start hiding real differences.",
    components: ["multi_static_select", "timepicker", "modal-frame"],
  },
  {
    id: "modal-frame-long-content-refused",
    title:
      "Block Kit Builder refused extra/fidelity/modal-frame/long-content and extra/fidelity/home-tab/long-content",
    evidence: [
      'Modal light sitting: loading it twice left the previous payload in the preview ("the Builder didn\'t take the new one"); the reference was left out rather than committed stale.',
      "Modal dark sitting: a third try, light and dark, reported success, but references:check found both captures still showed the previous fixture; they were left out.",
      "App Home sitting: extra/fidelity/home-tab/long-content was refused the same way in light and dark (references:check: the Builder kept the previous payload), so its @poke-more-1 probe found nothing to poke.",
      "The payload breaks no limit we know of (limits.ts passes): a 12-character title, Submit and Cancel, 14 mrkdwn sections of about 330 characters (Slack allows 3000 each and 100 blocks in a modal). It's 5.7 KB of JSON, 8.3 KB URL-encoded in the Builder's address; larger message payloads were accepted (extra/fidelity/carousel/many-items, 11.3 KB encoded). extra/fidelity/home-tab/long-content (7.0 KB encoded) has no reference yet either.",
    ],
    suspect: [
      "Unknown: possibly a size limit on the modal (and Home tab) preview, or something in the Builder's modal handling of many sections.",
    ],
    next: "Bisect in the Builder: load the fixture with 7 sections, then 10, to find the limit, and record it in limits.ts with the fixture as evidence. The fixture is unchanged.",
    components: ["modal-frame", "home-tab"],
  },
  {
    id: "select-space-picks-while-typing",
    title: "A space typed into Slack's open static select picks the highlighted option",
    evidence: [
      'Light desktop real-input run, contexts/static_select/actions@typeahead: typing "Option 3" into the open list closed it with "Option 1" chosen. The space picked the highlighted option before the "3" arrived, so typing text with a space isn\'t a pure typeahead in Slack.',
      "capture.js then waited for the field to read the typed text and timed out; it now counts the step done once the keys were typed.",
    ],
    suspect: [
      "Not a harness bug: Slack's behaviour. Ours: packages/block-kit/src/elements/useCombobox.ts, whether a space typed into an open list's query picks the highlighted option or types into the query.",
    ],
    next: 'The typeahead probe now types "3", which has no space; a probe that types "Option 3" would record the space pick on its own. Replay both on ours (bun tools/visual/src/probes.ts contexts/static_select).',
    components: ["static_select", "option"],
  },
  {
    id: "outside-click-only-closes",
    title: "A click on another select while Slack's menu is open only closes the menu",
    evidence: [
      "Light desktop real-input run, extra/payloads/selects@outside-click: with field-1's list open, the first real click on field-2 closed the list and didn't open field-2; a second click opened it. Slack's open menu lays an overlay over the page, which takes the click.",
      "The committed recording (selects@outside-click.behaviour.json) shows field-2 open after step 2 because only the second click counted: capture.js then counted a click only when it reached field-2. It now counts the first, which landed inside field-2's box, so a new recording shows the click that only closes.",
    ],
    suspect: [
      "Not a harness bug: Slack's behaviour. Ours: packages/block-kit/src/elements/Popover.tsx, whether an outside click also reaches the control under it.",
    ],
    next: "Re-record extra/payloads/selects@outside-click, then replay it on ours (bun tools/visual/src/probes.ts extra/payloads/selects).",
    components: ["static_select"],
  },
];
