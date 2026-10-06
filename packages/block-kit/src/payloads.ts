import type { AnyBlock } from "@slack/types";
import type { BlockAction, StateValues } from "./context";

/**
 * Builders for the exact JSON Slack sends to an app's request URL: `block_actions`,
 * `view_submission` and `view_closed`. Shapes are cross-checked against `@slack/bolt`'s
 * `BlockAction`, `ViewSubmitAction` and `ViewClosedAction` types and Slack's documented examples.
 *
 * These are plain functions (no React) so `@nkootstra/block-kit/server` and tests can use
 * them without pulling in the renderer.
 */

export interface PayloadTeam {
  id: string;
  domain: string;
  enterprise_id?: string;
  enterprise_name?: string;
}

export interface PayloadUser {
  id: string;
  username?: string;
  /** Only present for Home tab actions, per Slack's docs. */
  name?: string;
  team_id?: string;
}

/** Identity fields Slack stamps onto every payload. Defaulted so a demo/emulator works with no setup. */
export interface PayloadIdentity {
  team?: PayloadTeam | null;
  user?: PayloadUser;
  apiAppId?: string;
  token?: string;
  triggerId?: string;
  responseUrl?: string;
  /** Whether the app is installed org-wide on an Enterprise Grid org (`is_enterprise_install`). */
  isEnterpriseInstall?: boolean;
}

const DEFAULT_IDENTITY = {
  team: { id: "T00000000", domain: "workspace" } as PayloadTeam | null,
  user: { id: "U00000000", username: "user", name: "user", team_id: "T00000000" } as PayloadUser,
  apiAppId: "A00000000",
  token: "verification-token",
  triggerId: "000000000000.000000000000.deadbeefdeadbeefdeadbeefdeadbeef",
  responseUrl:
    "https://hooks.slack.com/actions/T00000000/0000000000000/deadbeefdeadbeefdeadbeefdeadbeef",
  isEnterpriseInstall: false,
};

type ResolvedIdentity = typeof DEFAULT_IDENTITY;

function resolveIdentity(identity?: PayloadIdentity): ResolvedIdentity {
  return { ...DEFAULT_IDENTITY, ...identity };
}

/** The `message` surface's container: the message the block_actions/actions came from. */
export interface MessageContainer {
  type: "message";
  channelId?: string;
  messageTs: string;
  isEphemeral?: boolean;
  /** Raw message object, if available, sent back verbatim as payload.message. */
  message?: Record<string, unknown>;
}

/** A view as Slack would echo it back: enough fields to build view_submission/view_closed/block_actions. */
export interface ViewLike {
  /** Slack assigns this at `views.open` time; default to a placeholder id for standalone previews. */
  id?: string;
  type: "modal" | "home";
  callback_id?: string;
  private_metadata?: string;
  hash?: string;
  blocks: AnyBlock[];
  title?: { type: "plain_text"; text: string; emoji?: boolean } | null;
  close?: { type: "plain_text"; text: string; emoji?: boolean } | null;
  submit?: { type: "plain_text"; text: string; emoji?: boolean } | null;
  root_view_id?: string | null;
  previous_view_id?: string | null;
  clear_on_close?: boolean;
  notify_on_close?: boolean;
  external_id?: string;
}

/** The `modal`/`home` surface's container: the view the block_actions came from. */
export interface ViewContainer {
  type: "view";
  view: ViewLike;
}

export type Container = MessageContainer | ViewContainer;

function toViewOutput(view: ViewLike, state: StateValues, identity: ResolvedIdentity) {
  const viewId = view.id ?? "V00000000";
  return {
    id: viewId,
    team_id: identity.team?.id ?? "",
    app_installed_team_id: identity.team?.id ?? "",
    app_id: identity.apiAppId ?? null,
    bot_id: "B00000000",
    callback_id: view.callback_id ?? "",
    type: view.type,
    title: view.title ?? null,
    close: view.close ?? null,
    submit: view.submit ?? null,
    blocks: view.blocks,
    private_metadata: view.private_metadata ?? "",
    state: { values: state },
    hash: view.hash ?? "0.0000000000",
    clear_on_close: view.clear_on_close ?? false,
    notify_on_close: view.notify_on_close ?? false,
    root_view_id: view.root_view_id ?? viewId,
    previous_view_id: view.previous_view_id ?? null,
    external_id: view.external_id ?? "",
  };
}

/**
 * A text object as Slack echoes it back: `plain_text` gains `emoji: true` and `mrkdwn` gains
 * `verbatim: false` unless the app set them.
 */
export function normalizeText<T>(text: T): T {
  if (typeof text !== "object" || text === null) return text;
  const object = text as { type?: unknown; emoji?: unknown; verbatim?: unknown };
  if (object.type === "plain_text") return { ...text, emoji: object.emoji ?? true };
  if (object.type === "mrkdwn") return { ...text, verbatim: object.verbatim ?? false };
  return text;
}

function normalizeOption(option: unknown): unknown {
  if (typeof option !== "object" || option === null) return option;
  const { text, description } = option as { text?: unknown; description?: unknown };
  return {
    ...option,
    ...(text === undefined ? {} : { text: normalizeText(text) }),
    ...(description === undefined ? {} : { description: normalizeText(description) }),
  };
}

/** An action or state entry with every text object it echoes normalized like Slack's. */
function normalizeEchoes<T extends Record<string, unknown>>(entry: T): T {
  const out: Record<string, unknown> = { ...entry };
  if (out.text !== undefined) out.text = normalizeText(out.text);
  if (out.placeholder !== undefined) out.placeholder = normalizeText(out.placeholder);
  if (out.selected_option) out.selected_option = normalizeOption(out.selected_option);
  if (Array.isArray(out.selected_options)) {
    out.selected_options = out.selected_options.map(normalizeOption);
  }
  if (typeof out.confirm === "object" && out.confirm !== null) {
    const confirm = { ...(out.confirm as Record<string, unknown>) };
    for (const key of ["title", "text", "confirm", "deny"]) {
      if (confirm[key] !== undefined) confirm[key] = normalizeText(confirm[key]);
    }
    out.confirm = confirm;
  }
  return out as T;
}

function normalizeState(state: StateValues): StateValues {
  return Object.fromEntries(
    Object.entries(state).map(([blockId, elements]) => [
      blockId,
      Object.fromEntries(
        Object.entries(elements).map(([actionId, value]) => [actionId, normalizeEchoes(value)]),
      ),
    ]),
  );
}

export interface BuildBlockActionsPayloadOptions {
  action: BlockAction;
  state: StateValues;
  container: Container;
  identity?: PayloadIdentity;
}

/** The Enterprise Grid org a payload came from, as Slack names it. */
export interface PayloadEnterprise {
  id: string;
  name: string;
}

interface BlockActionsPayloadBase {
  type: "block_actions";
  actions: BlockAction[];
  team: PayloadTeam | null;
  /** The team's Enterprise Grid org, or `null` outside one. */
  enterprise: PayloadEnterprise | null;
  is_enterprise_install: boolean;
  user: PayloadUser;
  token?: string;
  response_url?: string;
  trigger_id?: string;
  api_app_id?: string;
}

export interface MessageBlockActionsPayload extends BlockActionsPayloadBase {
  channel?: { id: string; name: string };
  message: Record<string, unknown>;
  state: { values: StateValues };
  container: {
    type: "message";
    message_ts: string;
    channel_id?: string;
    is_ephemeral: boolean;
  };
}

export interface ViewBlockActionsPayload extends BlockActionsPayloadBase {
  view: ReturnType<typeof toViewOutput>;
  container: { type: "view"; view_id: string };
}

export type BlockActionsPayload = MessageBlockActionsPayload | ViewBlockActionsPayload;

/** Slack's `block_actions` payload, for either a message's or a view's interactive elements. */
export function buildBlockActionsPayload(
  options: BuildBlockActionsPayloadOptions & { container: MessageContainer },
): MessageBlockActionsPayload;
export function buildBlockActionsPayload(
  options: BuildBlockActionsPayloadOptions & { container: ViewContainer },
): ViewBlockActionsPayload;
export function buildBlockActionsPayload(
  options: BuildBlockActionsPayloadOptions,
): BlockActionsPayload;
export function buildBlockActionsPayload({
  action,
  state,
  container,
  identity,
}: BuildBlockActionsPayloadOptions): BlockActionsPayload {
  const id = resolveIdentity(identity);
  state = normalizeState(state);
  const base = {
    type: "block_actions" as const,
    actions: [normalizeEchoes(action)],
    team: id.team,
    enterprise: id.team?.enterprise_id
      ? { id: id.team.enterprise_id, name: id.team.enterprise_name ?? "" }
      : null,
    is_enterprise_install: id.isEnterpriseInstall,
    user: id.user,
    token: id.token,
    response_url: id.responseUrl,
    trigger_id: id.triggerId,
    api_app_id: id.apiAppId,
  };

  if (container.type === "message") {
    return {
      ...base,
      channel: container.channelId ? { id: container.channelId, name: "" } : undefined,
      message: container.message ?? { type: "message", ts: container.messageTs },
      state: { values: state },
      container: {
        type: "message" as const,
        message_ts: container.messageTs,
        channel_id: container.channelId,
        is_ephemeral: container.isEphemeral ?? false,
      },
    };
  }

  return {
    ...base,
    view: toViewOutput(container.view, state, id),
    container: { type: "view" as const, view_id: container.view.id ?? "V00000000" },
  };
}

export interface BuildViewSubmissionPayloadOptions {
  view: ViewLike;
  state: StateValues;
  identity?: PayloadIdentity;
  responseUrls?: Array<{
    block_id: string;
    action_id: string;
    channel_id: string;
    response_url: string;
  }>;
}

/** Slack's `view_submission` payload, sent when the modal's Submit button is pressed. */
export function buildViewSubmissionPayload({
  view,
  state,
  identity,
  responseUrls,
}: BuildViewSubmissionPayloadOptions) {
  const id = resolveIdentity(identity);
  return {
    type: "view_submission" as const,
    team: id.team,
    user: {
      id: id.user.id,
      name: id.user.name ?? id.user.username ?? "",
      team_id: id.user.team_id,
    },
    api_app_id: id.apiAppId,
    token: id.token,
    trigger_id: id.triggerId,
    view: toViewOutput(view, state, id),
    response_urls: responseUrls ?? [],
  };
}

export interface BuildViewClosedPayloadOptions {
  view: ViewLike;
  state: StateValues;
  identity?: PayloadIdentity;
  /** True when Slack cleared the whole view stack (vs. just closing the top view). */
  isCleared?: boolean;
}

/** Slack's `view_closed` payload, sent when the modal's close (X) button is pressed. */
export function buildViewClosedPayload({
  view,
  state,
  identity,
  isCleared,
}: BuildViewClosedPayloadOptions) {
  const id = resolveIdentity(identity);
  return {
    type: "view_closed" as const,
    team: id.team,
    user: {
      id: id.user.id,
      name: id.user.name ?? id.user.username ?? "",
      team_id: id.user.team_id,
    },
    api_app_id: id.apiAppId,
    token: id.token,
    view: toViewOutput(view, state, id),
    is_cleared: isCleared ?? false,
  };
}

/** The subset of `ack()` response actions a modal reacts to: validation errors, or view navigation. */
export type ViewResponseAction =
  | { response_action: "errors"; errors: Record<string, string> }
  | { response_action: "update"; view: ViewLike }
  | { response_action: "push"; view: ViewLike }
  | { response_action: "clear" };

/** A static/external select option, as returned to a `block_suggestion` request. */
export interface SuggestionOption {
  text: { type: "plain_text"; text: string; emoji?: boolean };
  value: string;
  description?: { type: "plain_text"; text: string; emoji?: boolean };
  url?: string;
}

/** What an app answers a `block_suggestion` request with: flat options or labelled groups. */
export type OptionsResponse =
  | { options: SuggestionOption[] }
  | {
      option_groups: Array<{
        label: { type: "plain_text"; text: string; emoji?: boolean };
        options: SuggestionOption[];
      }>;
    };

export interface BuildBlockSuggestionPayloadOptions {
  actionId: string;
  blockId: string;
  /** What the user has typed into the select's search box so far. */
  value: string;
  container: Container;
  state: StateValues;
  identity?: PayloadIdentity;
}

/** Slack's `block_suggestion` payload, sent while the user types into an `external_select`. */
export function buildBlockSuggestionPayload({
  actionId,
  blockId,
  value,
  container,
  state,
  identity,
}: BuildBlockSuggestionPayloadOptions) {
  const id = resolveIdentity(identity);
  const base = {
    type: "block_suggestion" as const,
    user: id.user,
    api_app_id: id.apiAppId,
    token: id.token,
    action_id: actionId,
    block_id: blockId,
    value,
    team: id.team,
  };

  if (container.type === "message") {
    return {
      ...base,
      container: {
        type: "message" as const,
        message_ts: container.messageTs,
        channel_id: container.channelId,
        is_ephemeral: container.isEphemeral ?? false,
      },
      channel: container.channelId ? { id: container.channelId, name: "" } : undefined,
      message: container.message ?? { type: "message", ts: container.messageTs },
    };
  }

  return {
    ...base,
    container: { type: "view" as const, view_id: container.view.id ?? "V00000000" },
    view: toViewOutput(container.view, state, id),
  };
}

export type BlockSuggestionPayload = ReturnType<typeof buildBlockSuggestionPayload>;
