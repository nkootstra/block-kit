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
    id: "show-more-clipped",
    title: "Section Show more button is probably clipped, and its layout doesn't replay",
    evidence: [
      "snapshotReplay.browser.ts fails on extra/fidelity/show-more/default and show-more/toggled: the replay puts button.sbk-section__toggle at y=304, where it was laid out live at y=150 (x=44, 63.8 x 22px).",
      "Live, y=150 is just below the five clamped lines, inside the box that hides the overflow, so the button is likely invisible.",
      "Verification session: Slack doesn't truncate extra/fidelity/show-more/default at all (about 980 characters of mrkdwn render in full, no Show more). Our 300-character, 5-line clamp and its Show more aren't Slack's behaviour at that length; Slack's threshold, if any, is unknown. extra/fidelity/section/long-content (2,999 characters, Slack's section limit is 3,000) will show whether Slack truncates at all.",
    ],
    suspect: [
      "packages/block-kit/src/blocks/Section.tsx renders the toggle inside .sbk-section__text--clamped (display: -webkit-box, -webkit-box-orient: vertical, -webkit-line-clamp: 5, overflow: hidden), so the clamp and the overflow clip apply to the button too.",
      "tools/visual/src/snapshot.js may not replay -webkit-box line clamping faithfully: the frozen copy lays the clamped box's children out differently from the live page.",
      "The truncation itself is a guess (Section.tsx: 300 characters, 5 lines); Slack's real limit is unknown.",
    ],
    next: "Capture show-more/default and show-more/default@expanded in Block Kit Builder: they show Slack's truncation and where its toggle sits.",
    components: ["section", "show-more"],
  },
  {
    id: "rich-text-unknown-inline",
    title: "Unknown rich text elements render nothing",
    evidence: [
      "RichText.tsx's inline switch returns null for a type it doesn't know, so the 12 documented elements the package doesn't implement (citation, canvas, tag…) disappear without a trace, where an unknown block or element shows the visible Unsupported placeholder.",
    ],
    suspect: [
      "packages/block-kit/src/blocks/RichText.tsx, the default case of the inline element switch.",
    ],
    next: "Capture the extra/fidelity/rich-text-* fixtures to see what Slack draws for each.",
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
    id: "chart-many-categories",
    title: "A bar chart with 20 categories: Slack rotates the labels, ours overlap",
    evidence: [
      "extra/fidelity/data-visualization/many-items@mobile+dark: 8.78% of pixels differ, 64 text findings (compare image: test-results/visual/extra/fidelity/data-visualization/many-items@mobile+dark).",
      "Slack rotates the x-axis category labels about 45° when they don't fit; ours stay horizontal and overlap (D1 is 17.4px wide in ours, 23.6px in Slack's, and starts 4-5px further right).",
      "Slack's plot area is shorter, leaving room for the rotated labels, so the bars and gridlines don't line up: the y-axis 0 sits at y=357 in Slack's and 409 in ours, 150 at 92 and 84.",
      "In the dark theme our chart card's background is lighter than Slack's.",
      "Both sides clip the chart at the right edge of the 400px mobile preview: that's Slack's real behaviour (the card is wider than the preview), not a width bug. The reference's 400px against our 364px is the harness's gutter convention.",
    ],
    suspect: [
      "packages/block-kit/src/charts/CartesianChart.tsx: no label rotation when categories don't fit, and the plot height that follows from it.",
      "packages/block-kit/src/blocks/DataVisualization.css: the card's dark background.",
    ],
    next: "Capture the fixture at desktop width and in light to separate the label rotation from the width and the theme.",
    components: ["data_visualization"],
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
    id: "chart-menu-mobile-clipped",
    title:
      "On mobile, Slack's chart More actions button sits outside the message, clipped and unclickable",
    evidence: [
      "Dark mobile sitting: in the 400px Mobile preview, catalog/data-visualization/area-multi-series's More actions button (menu-1) is laid out at about CSS x 732, past the message's right edge, so it's clipped and a click can't reach it. area-multi-series@menu+mobile and @menu+mobile+dark both timed out for that reason. The hover state (hover-menu-1 at the card's top-right) was reachable in the light mobile sitting.",
      "The chart card keeps its 400px minimum width inside a scroller (finding chart-mobile-scroll), so its top-right corner, where the menu sits, is off screen until scrolled.",
    ],
    suspect: [
      "Not a harness bug: Slack's (or the Builder's) layout. Ours: packages/block-kit/src/blocks/DataVisualization.tsx and DataVisualization.css place the menu on the card too; decide whether to match Slack (menu out of reach on mobile) or keep it reachable.",
    ],
    next: "The plan no longer asks for @menu+mobile on charts. Compare our mobile render's menu position with Slack's @mobile references and decide.",
    components: ["data_visualization"],
  },
  {
    id: "markdown-list-spacing",
    title: "Markdown ordered lists sit further in, and blocks after a list sit higher",
    evidence: [
      "extra/fidelity/markdown/mixed@mobile+dark (2.78%): ordered list items start at x=83 in ours vs Slack's 72; everything after the bullet list moves up by 8px, growing to 32px by the table (quote 217 vs 233, code 255 vs 279, table 294 vs 326). Ours is 357px tall, Slack's 389.",
      'Slack also shows a "Markdown" label ours lacks, already a text-baseline finding of catalog/markdown/code.',
    ],
    suspect: [
      "packages/block-kit/src/blocks/Markdown.css: ordered list padding and the vertical margins between lists, quotes, code and tables.",
    ],
    next: "The light and desktop captures of markdown/mixed will show whether the gaps depend on the width.",
    components: ["markdown"],
  },
  {
    id: "text-input-count-unfocused",
    title: "The character count shows on an unfocused field",
    evidence: [
      'extra/fidelity/plain-text-input/long-content@mobile+dark (1.42%): ours shows "20" ("20 characters remaining") on a multiline field holding 380 of its 400 characters; Slack\'s unfocused field shows no count.',
    ],
    suspect: [
      "packages/block-kit/src/elements/TextInput.tsx: when the remaining-characters count appears (the interaction tests check it focused).",
    ],
    next: "Capture the field focused, once focus capture exists, to see when Slack shows the count.",
    components: ["plain_text_input"],
  },
  {
    id: "rich-text-colour-hex",
    title: "A rich text colour shows its swatch without the hex value",
    evidence: [
      'extra/fidelity/rich-text-rich-text-list/many-items@mobile+dark (2.63%): Slack writes "· colour #1264A3", ours "· colour"; at the mobile width Slack\'s longer line wraps, so everything below sits 22px lower in Slack. Already a text-baseline finding of extra/rich-text/mentions-and-styles.',
    ],
    suspect: ["packages/block-kit/src/blocks/RichText.tsx, the color element."],
    next: "Nothing to capture: the existing references show it.",
    components: ["rich_text.color"],
  },
  {
    id: "select-placeholder-dashes",
    title:
      "Slack drops the dashes around a button select's placeholder at mobile width and when open",
    evidence: [
      'Confirmed by a fresh capture (extra/payloads/selects@mobile, light, captured in the verification session): at the mobile width, in light and dark, and in the @open states, Slack writes the static select\'s placeholder as "Choose"; at desktop width at rest it writes "--Choose--". The earlier +mobile+dark captures (extra/payloads/selects, catalog/container/data-entry-form) show the same, so it isn\'t a Builder change.',
      'Ours always writes "--Choose--".',
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.tsx: the button select's dashed placeholder. Slack seems to add the dashes only in the desktop at-rest layout; which rule decides it (width, the open state, the button-select layout) is to be found from the references.",
    ],
    next: "Compare every reference of a button select (desktop, mobile, @open, dark) for the placeholder text, then match the rule.",
    components: ["static_select"],
  },
  {
    id: "button-long-text-ellipsis",
    title: "Slack cuts a long button label to one line with an ellipsis; ours wraps",
    evidence: [
      'extra/fidelity/button/long-content (verification session, light desktop): 10.2% of pixels differ. Slack keeps the button on one line, ending "This sentence is here to make the text l…", in an 82px message; ours wraps the 75-character label onto several lines, 118px.',
    ],
    suspect: [
      "packages/block-kit/src/elements/Button.css: white-space, overflow and text-overflow on the label, and the button's max-width.",
    ],
    next: "Read the reference's box model (bun tools/visual/src/inspect.ts extra/fidelity/button/long-content) for the button's max-width and the label's overflow.",
    components: ["button"],
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
    id: "mrkdwn-short-user-mention",
    title:
      "Mentions Slack draws as chips that ours leaves out (a short user ID, the callout's mention)",
    evidence: [
      "message/mrkdwn: Slack draws four mention chips for <@U123> <#C123> <!here> <!subteam^S123|@devs> (the unresolved user as a member chip, c-member_slug); ours draws three, leaving <@U123> as plain text (counted by the harness's mention addresses, which shift by one on our side after the first).",
      "catalog/callout/callout: Slack shows one mention, ours none.",
    ],
    suspect: [
      "packages/block-kit/src/parser (the mrkdwn mention pattern): it likely requires a full-length user ID, while Slack accepts <@U123>.",
    ],
    next: "Capture a probe or @hover-mention-1 on message/mrkdwn to see Slack's chip for it.",
    components: ["rich_text.user"],
  },
  {
    id: "task-card-output-links",
    title: "An expanded task card shows source links where Slack shows the output's links",
    evidence: [
      "catalog/agents/task-card@expanded (counted by the harness's link and source addresses): Slack shows the output's two rich text links (one without the underline class) and no source links; ours shows two source links and no rich text links.",
    ],
    suspect: [
      "packages/block-kit/src/blocks/TaskCard.tsx: what the expanded card renders from output and sources.",
    ],
    next: "Compare the @expanded references side by side; a @hover-link-1 capture shows Slack's link styles.",
    components: ["task_card", "url_source", "rich_text.link"],
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
    id: "static-select-keyboard",
    title: "An open static select's keyboard highlight, Enter and focus differ from Slack's",
    evidence: [
      'Probe contexts/static_select/actions@keyboard (verification session): Slack\'s first ArrowDown highlights "Option 2" (option 1 is already highlighted when the list opens), ours "Option 1"; after two ArrowDowns and Enter, Slack picks "Option 3", ours "Option 2".',
      "After Enter, Slack keeps focus on the field; ours moves it to the option.",
      "The same start shows in the users, conversations and channels selects: Slack's Enter right after opening picks the first entry (contexts/*_select/actions@pick recordings); ours picks nothing and sends no payload (listed in actionPayloads.test.tsx KNOWN_UNSENT).",
      'Ours marks option 1 aria-selected="true" before anything is chosen, and lists an extra option-4 entry Slack doesn\'t have.',
    ],
    suspect: [
      "packages/block-kit/src/elements/useCombobox.ts and Select.tsx: the initial highlight on open, where focus goes after a pick, aria-selected before a selection, and the extra list entry.",
    ],
    next: "Replay the recording on ours (bun tools/visual/src/probes.ts contexts/static_select) after a fix; the other select probes will show whether multi, users and conversations selects share it.",
    components: ["static_select", "option"],
  },
  {
    id: "select-focus-styles",
    title: "A focused select's borders and the controls' transitions differ from Slack's",
    evidence: [
      "State styles in contexts/static_select/actions@focus-field-1 and the plain verification captures: Slack's focused select has transparent left and bottom borders (field-1 :focus border colours rgba(0, 0, 0, 0)); ours keeps them.",
      "Motion: ours adds border and box-shadow transitions on selects and pickers that Slack doesn't have; Slack's chart card has a box-shadow transition ours lacks.",
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.css (focus borders and transitions), DataVisualization.css (the card's transition).",
    ],
    next: "Compare the stateStyles lines compare.ts prints for every select reference once more are captured.",
    components: ["static_select", "data_visualization"],
  },
  {
    id: "mrkdwn-link-hover-layout",
    title: "Hovering a mrkdwn link shifts Slack's message 22px lower than ours (to check)",
    evidence: [
      "message/mrkdwn@hover-link-1 (verification session): with the first link hovered, everything after the first section sits 22px lower in Slack's capture than in ours (the quote at y=215 against 193).",
    ],
    suspect: [
      "Unknown: a hover card or hover-induced layout in Slack's preview, or a difference at rest the plain reference doesn't show. Check the plain message/mrkdwn reference for the same offset first.",
    ],
    next: "Compare message/mrkdwn and @hover-link-1 side by side (bun tools/visual/src/inspect.ts) to see what grows by 22px.",
    components: ["rich_text.link", "text_object"],
  },
  {
    id: "accessory-multi-select-count",
    title: 'Slack labels an accessory multi-select holding a value "1 selected" (to compare)',
    evidence: [
      'Light desktop chunks: a section accessory multi-select with an initial value shows a "1 selected" button, not a chip.',
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.tsx and SelectDialog.tsx: the accessory button's label before the dialog opens (the interaction test checks the count after Confirm).",
    ],
    next: "Compare extra/fidelity/multi-conversations-select/initial-value and the contexts accessory references with ours.",
    components: ["select-dialog", "multi_static_select"],
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
    id: "directory-select-placeholder",
    title:
      "Our users, conversations and channels selects send their placeholder and not their initial value; Slack's do the opposite",
    evidence: [
      'extra/actions/more-elements@pick, contexts/{users,conversations,channels}_select/actions@pick and extra/fidelity/channels-select/long-content@pick: Slack\'s action has no placeholder; ours echoes it (e.g. {"type":"plain_text","text":"Pick a channel","emoji":true}). Slack\'s static_select and multi_static_select actions do carry it (catalog/actions/all-selects@pick, extra/payloads/selects@pick-multi).',
      'catalog/actions/selects-with-initial-options@pick: Slack\'s channels_select action echoes initial_channel "C12345678"; ours leaves it out (Select.tsx echoes only a static select\'s initial_option). extra/fidelity/users-select/long-content@pick (dark desktop session) shows the same for a users_select\'s initial_user "U12345678".',
      "extra/fidelity/confirm/long-content@pick and users-select/long-content@pick add two more placeholders Slack doesn't send.",
      "Mobile pick sitting: catalog/actions/filtered-conversations-select@pick and catalog/section/users-select@pick show it again.",
      "All listed in actionPayloads.test.tsx KNOWN_DIFFERENCES.",
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.tsx, where the action echoes the placeholder and initial_option for every select type.",
    ],
    next: "For users, conversations and channels selects, leave the placeholder out and echo initial_user / initial_conversation / initial_channel (multi variants once a recording with initial values shows them), then drop the KNOWN_DIFFERENCES entries.",
    components: ["channels_select", "users_select", "conversations_select"],
  },
  {
    id: "select-dialog-directory",
    title: "Our accessory multi-select dialog lists no members or channels for a directory select",
    evidence: [
      "extra/payloads/accessory-multi-selects@pick-confirm-{users,channels,conversations} (light desktop retry): in Slack the dialog's field opens a list of the workspace's members or channels, ArrowDown and Enter pick the first, Confirm sends it (selected_users [\"U0000001\"] and so on).",
      "Ours, replayed in Chromium with a directory resolver: the dialog's list opens empty, so nothing is picked and Confirm sends an empty selection. Listed in actionPayloads.test.tsx KNOWN_DIFFERENCES.",
      "Mobile pick sitting: contexts/multi_users_select/accessory@pick and catalog/section/multi-conversations-select@pick (Slackbot through the dialog) show the same.",
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.tsx passes the SelectDialog `options={directory ? [] : allOptions(element)}`: a directory select only gets `addTyped`, never the resolver's entries.",
    ],
    next: "List resolvers.directory entries in the dialog (as the inline users, conversations and channels selects do), then drop the KNOWN_DIFFERENCES entries.",
    components: [
      "select-dialog",
      "multi_users_select",
      "multi_channels_select",
      "multi_conversations_select",
    ],
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
      "Arrow keys and Enter in Slack's open calendar don't change the date; ours pick the next day",
    evidence: [
      "contexts/datetimepicker/actions@keyboard (light desktop retry): after a click on the date field, ArrowRight then Enter left Slack's calendar open, focus on the date textbox and the date January 1st, 2026; the final payload's selected_date_time keeps that date.",
      "Ours, replayed in Chromium: the click moves focus into the calendar grid, ArrowRight moves to January 2nd and Enter picks it, so our payload would carry a day later. The jsdom replay in actionPayloads.test.tsx doesn't reproduce our focus move and passes, so no KNOWN_DIFFERENCES entry shows it.",
      'Modal light sitting (contexts/datetimepicker/modal-input@submit and datepicker/modal-input@submit, replayed with probes.ts): Slack\'s calendar is a popover with role grid and focus stays on the date input; ours opens a dialog (role "dialog") and moves focus into it.',
    ],
    suspect: [
      "packages/block-kit/src/elements/DatePicker.tsx and calendar/Calendar.tsx: focus moves into the grid on open, where Slack keeps it on the input.",
    ],
    next: "Replay the recording on ours (bun tools/visual/src/probes.ts contexts/datetimepicker) after a fix; check how Slack's calendar is reached by keyboard (Tab into the grid?) with a probe.",
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
    title: "Our controls in an input block aren't named by the block's label",
    evidence: [
      'Modal light sitting, the 28 behaviour recordings replayed on ours (bun tools/visual/src/probes.ts): a control focused in an input block is named after the block\'s label in Slack ("Label", "Title", "Priority"); ours is named after its action_id or type ("email", "rich", "title_input", "details_input", "Time", "--Select an item--"). Seen in every */modal-input@poke-input-1, @poke-richtext-1 and @submit, and in extra/modal/form@tab.',
    ],
    suspect: [
      "packages/block-kit/src/blocks/Input.tsx and the elements' aria-label: the label isn't tied to the control (aria-labelledby / <label for>), and an aria-label from the action_id wins.",
    ],
    next: "Label each input block's control by the block's label (Slack's aria-labelledby points at it), then replay the modal recordings again.",
    components: ["input", "plain_text_input", "email_text_input", "rich_text_input"],
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
    title:
      "In a modal, Slack's multi-select field is a typeable combobox; ours is a button whose Enter closes the list",
    evidence: [
      "Modal light sitting, contexts/multi_static_select/modal-input@add-remove (click field-1, Enter, ArrowDown, Enter, Escape, Backspace): Slack's field is a combobox; Enter right after opening keeps the list open with nothing highlighted, ArrowDown highlights Option 1, Enter picks it and the list stays open, Escape closes it, and Backspace then removes nothing. Ours is a button: Enter after opening toggles the list shut, and the steps after it land elsewhere.",
    ],
    suspect: [
      "packages/block-kit/src/elements/Select.tsx: the multi-select's trigger is a button (toggleFromTrigger), where Slack's is a typeable field.",
    ],
    next: "Replay the recording on ours after a change (bun tools/visual/src/probes.ts contexts/multi_static_select/modal-input).",
    components: ["multi_static_select"],
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
    title: "Block Kit Builder refused extra/fidelity/modal-frame/long-content",
    evidence: [
      'Modal light sitting: loading it twice left the previous payload in the preview ("the Builder didn\'t take the new one"); the reference was left out rather than committed stale.',
      "The payload breaks no limit we know of (limits.ts passes): a 12-character title, Submit and Cancel, 14 mrkdwn sections of about 330 characters (Slack allows 3000 each and 100 blocks in a modal). It's 5.7 KB of JSON, 8.3 KB URL-encoded in the Builder's address; larger message payloads were accepted (extra/fidelity/carousel/many-items, 11.3 KB encoded). extra/fidelity/home-tab/long-content (7.0 KB encoded) has no reference yet either.",
    ],
    suspect: [
      "Unknown: possibly a size limit on the modal (and Home tab) preview, or something in the Builder's modal handling of many sections.",
    ],
    next: "Bisect in the Builder: load the fixture with 7 sections, then 10, to find the limit, and record it in limits.ts with the fixture as evidence. The fixture is unchanged.",
    components: ["modal-frame"],
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
