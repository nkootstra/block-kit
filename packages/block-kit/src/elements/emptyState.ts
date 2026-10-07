import type { ElementState } from "../context";

/**
 * The value Slack reports in `view.state.values` for an input the user hasn't touched. The view
 * state holds every block with a stateful element, and `@slack/bolt`'s `ViewStateValue` types each
 * value as `| null`, or as a list for multi-value elements; Block Kit Builder's modal state lists
 * untouched inputs the same way (a rich text input as just its type).
 */
const EMPTY: Record<string, Omit<ElementState, "type">> = {
  plain_text_input: { value: null },
  number_input: { value: null },
  email_text_input: { value: null },
  url_text_input: { value: null },
  static_select: { selected_option: null },
  external_select: { selected_option: null },
  multi_static_select: { selected_options: [] },
  multi_external_select: { selected_options: [] },
  users_select: { selected_user: null },
  multi_users_select: { selected_users: [] },
  conversations_select: { selected_conversation: null },
  multi_conversations_select: { selected_conversations: [] },
  channels_select: { selected_channel: null },
  multi_channels_select: { selected_channels: [] },
  datepicker: { selected_date: null },
  timepicker: { selected_time: null },
  datetimepicker: { selected_date_time: null },
  checkboxes: { selected_options: [] },
  radio_buttons: { selected_option: null },
  rich_text_input: {},
  file_input: { files: [] },
};

/** Slack's empty state for an element type, or undefined for an element without state. */
export function emptyState(type: string): ElementState | undefined {
  const empty = EMPTY[type];
  return empty === undefined ? undefined : { type, ...empty };
}
