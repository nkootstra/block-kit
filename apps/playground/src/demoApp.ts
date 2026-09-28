import type {
  ActionContext,
  BlockAction,
  BlockSuggestionPayload,
  OptionsResponse,
  SubmitResult,
  ViewLike,
} from "@nkootstra/block-kit";

/**
 * A stand-in for the app on the other end of the playground's interactions, so opening modals,
 * dependent dropdowns, external selects and message updates can be tried without a real Slack app. It only reacts
 * to `demo_*` action ids (see fixtures/interactive); other external selects get generic options.
 */

const plain = (text: string) => ({ type: "plain_text" as const, text });
const option = (text: string) => ({ text: plain(text), value: text.toLowerCase() });

const CATEGORIES: Record<string, string[]> = {
  hardware: ["Laptop", "Monitor", "Keyboard", "Headset"],
  software: ["Figma", "Linear", "1Password", "Zoom"],
  access: ["Production database", "Admin panel", "Billing dashboard"],
};

const FRUIT = ["Apple", "Apricot", "Banana", "Blueberry", "Cherry", "Grape", "Mango", "Melon"];
const TEAMS = ["Design", "Engineering", "Finance", "IT", "Marketing", "People", "Sales"];

function requestView(category?: string): ViewLike {
  const items = category ? CATEGORIES[category] : undefined;
  return {
    type: "modal",
    callback_id: "demo_request",
    notify_on_close: true,
    title: plain("New request"),
    close: plain("Cancel"),
    submit: plain("Submit"),
    blocks: [
      {
        type: "input",
        block_id: "title",
        label: plain("Title"),
        element: { type: "plain_text_input", action_id: "title_input" },
      },
      {
        type: "input",
        block_id: "category",
        dispatch_action: true,
        label: plain("Category"),
        element: {
          type: "static_select",
          action_id: "demo_category",
          placeholder: plain("Choose a category"),
          options: Object.keys(CATEGORIES).map((c) => option(c[0]?.toUpperCase() + c.slice(1))),
        },
      },
      ...(items
        ? [
            {
              type: "input",
              // A new block_id per category resets the item select, as a real app would do.
              block_id: `item_${category}`,
              label: plain("Item"),
              element: {
                type: "static_select",
                action_id: "item",
                placeholder: plain(`Choose ${category} item`),
                options: items.map(option),
              },
            },
          ]
        : []),
      {
        type: "input",
        block_id: "team",
        optional: true,
        label: plain("Team"),
        element: {
          type: "external_select",
          action_id: "demo_team",
          min_query_length: 0,
          placeholder: plain("Search teams"),
        },
      },
      {
        type: "actions",
        block_id: "more",
        elements: [{ type: "button", action_id: "demo_push", text: plain("Add details…") }],
      },
    ] as ViewLike["blocks"],
  };
}

const detailsView: ViewLike = {
  type: "modal",
  callback_id: "demo_details",
  notify_on_close: true,
  title: plain("Details"),
  close: plain("Back"),
  submit: plain("Done"),
  blocks: [
    {
      type: "input",
      block_id: "details",
      label: plain("Anything else we should know?"),
      element: { type: "plain_text_input", action_id: "details_input", multiline: true },
    },
  ] as ViewLike["blocks"],
};

const doneView: ViewLike = {
  type: "modal",
  title: plain("Request sent"),
  close: plain("Close"),
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: ":white_check_mark: Thanks, IT is on it." } },
  ] as ViewLike["blocks"],
};

function decisionBlocks(verdict: string) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Ada Lovelace* requested access to *Billing dashboard*.\n${verdict} by <@U00000000>.`,
      },
    },
  ] as ViewLike["blocks"];
}

export function demoAction(action: BlockAction, { views, message }: ActionContext) {
  if (action.action_id === "demo_approve") {
    message?.update({ blocks: decisionBlocks(":white_check_mark: Approved") });
  }
  if (action.action_id === "demo_deny") message?.update({ blocks: decisionBlocks(":x: Denied") });
  if (action.action_id === "demo_dismiss") message?.delete();
  if (action.action_id === "demo_open_modal") views.open(requestView());
  if (action.action_id === "demo_push") views.push(detailsView);
  if (action.action_id === "demo_category") {
    const selected = action.selected_option as { value?: string } | undefined;
    views.update(requestView(selected?.value));
  }
}

export function demoOptions(payload: BlockSuggestionPayload): OptionsResponse {
  const query = payload.value.toLowerCase();
  const source =
    payload.action_id === "demo_fruit"
      ? FRUIT
      : payload.action_id === "demo_team"
        ? TEAMS
        : Array.from({ length: 5 }, (_, i) => `${payload.value || "Result"} ${i + 1}`);
  return { options: source.filter((s) => s.toLowerCase().includes(query)).map(option) };
}

type Values = Record<string, Record<string, { value?: string | null }>>;

export function demoSubmit(payload: {
  view: { callback_id: string; state: { values: unknown } };
}): SubmitResult {
  if (payload.view.callback_id !== "demo_request") return undefined;
  // Empty required fields never get here: the client catches those before submitting.
  const title = (payload.view.state.values as Values).title?.title_input?.value ?? "";
  if (title.trim().toLowerCase() === "test") {
    return { response_action: "errors", errors: { title: "Describe what you need, not “test”." } };
  }
  return { response_action: "update", view: doneView };
}
