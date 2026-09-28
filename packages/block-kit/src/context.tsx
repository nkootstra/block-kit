import type { AnyBlock } from "@slack/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type BlockSuggestionPayload,
  buildBlockActionsPayload,
  buildBlockSuggestionPayload,
  buildViewClosedPayload,
  buildViewSubmissionPayload,
  type Container,
  type OptionsResponse,
  type PayloadIdentity,
  type ViewLike,
  type ViewResponseAction,
} from "./payloads";
import { Modal, type ModalView } from "./surfaces/Modal";
import { ModalLayer } from "./surfaces/ModalLayer";

/**
 * The action object Slack puts in `block_actions.actions[]`. The extra fields depend on the
 * element type (`value`, `selected_option`, `selected_date`, ...), exactly as Slack sends them.
 */
export interface BlockAction {
  type: string;
  action_id: string;
  block_id: string;
  action_ts: string;
  text?: { type: "plain_text"; text: string; emoji?: boolean };
  value?: string;
  url?: string;
  style?: "primary" | "danger";
  [field: string]: unknown;
}

/** One entry of `view.state.values[block_id][action_id]`, e.g. `{ type: "datepicker", selected_date: "2024-01-01" }`. */
export interface ElementState {
  type: string;
  [field: string]: unknown;
}

/** Slack's `state.values`: element values keyed by block_id, then action_id. */
export type StateValues = Record<string, Record<string, ElementState>>;

export type Surface = "message" | "modal" | "home";

/** What a user mention's profile card shows; everything but the name is optional. */
export interface UserProfile {
  /** Display name, shown bold at the top of the card. */
  name: string;
  /** Full name, shown under the display name when it differs. */
  realName?: string;
  title?: string;
  pronouns?: string;
  avatarUrl?: string;
  /** Custom status, e.g. `{ emoji: "palm_tree", text: "On vacation" }`. */
  status?: { emoji?: string; text?: string };
  /** IANA zone used for the card's "local time" row, e.g. `Europe/Amsterdam`. */
  timeZone?: string;
}

/** Resolves ids in mrkdwn and rich text to display names. Return undefined when unknown. */
export interface Resolvers {
  user?: (id: string) => string | undefined;
  /**
   * Profile details for the card that opens when a user mention is clicked. Falls back to the
   * name from `user` when omitted.
   */
  userProfile?: (id: string) => UserProfile | undefined;
  channel?: (id: string) => string | undefined;
  usergroup?: (id: string) => string | undefined;
}

export interface EmojiOptions {
  /**
   * Builds the image URL for a unified code point sequence such as `1f44d-1f3fd`. Defaults to the
   * Apple set from emoji-datasource-apple on jsDelivr.
   */
  imageUrl?: (unified: string) => string;
  /** Workspace custom emoji: name → image URL, or `alias:<name>`. */
  custom?: Record<string, string>;
}

/** A modal opened through {@link ViewsApi}, with the validation errors last returned for it. */
export interface StackedView {
  view: ViewLike & { id: string };
  errors: Record<string, string>;
}

/**
 * Slack's `views.*` calls, for answering an interaction the way an app would: open a modal from a
 * button, push a second one on top, or update one in place (e.g. after a `dispatch_action` input).
 * Opened modals render on top of the provider's children, up to Slack's limit of 3.
 */
export interface ViewsApi {
  /** `views.open`: replaces any open modals with this one. Returns the new view's id. */
  open: (view: ViewLike) => string;
  /** `views.push`: stacks a modal on top of the current one. Returns the new view's id. */
  push: (view: ViewLike) => string;
  /**
   * `views.update`: swaps a modal's content, keeping its id and any input values whose
   * `block_id`/`action_id` are unchanged. Targets `viewId` or `externalId`, else the top modal.
   */
  update: (view: ViewLike, target?: { viewId?: string; externalId?: string }) => void;
  /** Closes the top modal, returning to the one below it. */
  close: () => void;
  /** Closes every open modal. */
  clear: () => void;
  /** `views.publish`: replaces the content of the `<HomeTab>` rendered under this provider. */
  publish: (view: ViewLike) => void;
}

/** New content for a message, as an app would send with `chat.update` or a `response_url`. */
export interface MessageUpdate {
  blocks?: AnyBlock[];
  text?: string;
}

/**
 * Answers an interaction by changing the message it came from, like posting to its `response_url`
 * with `replace_original` / `delete_original`, or calling `chat.update` / `chat.delete`.
 */
export interface MessageApi {
  /** Replaces the message's blocks and fallback text. */
  update: (message: MessageUpdate) => void;
  /** Removes the message. */
  delete: () => void;
}

/** What an interaction happened in: the message/view it came from, and a handle to change the message. */
export interface SurfaceScopeValue {
  container: Container;
  message?: MessageApi;
}

export interface ActionContext {
  /** State of every input on the surface at the time of the action, like `state.values`. */
  state: StateValues;
  /** Opens, pushes or updates modals in response, like an app calling `views.*`. */
  views: ViewsApi;
  /** Set for actions in a `<Message>`: replaces or deletes that message. */
  message?: MessageApi;
}

/** The second argument of `onPayload`. */
export interface PayloadContext {
  views: ViewsApi;
  /** Set for actions in a `<Message>`: replaces or deletes that message. */
  message?: MessageApi;
}

/** What `onSubmit` may return: Slack's `response_action` ack, or nothing to just close the modal. */
export type SubmitResult = ViewResponseAction | undefined | void;

export interface BlockKitContextValue {
  surface: Surface;
  onAction?: (action: BlockAction, context: ActionContext) => void;
  /** Same actions as `onAction`, wrapped in the full Slack `block_actions` payload (team/user/container/...). */
  onPayload?: (
    payload: ReturnType<typeof buildBlockActionsPayload>,
    context: PayloadContext,
  ) => void;
  /** Called with a `view_submission` payload when a `<Modal>`'s Submit button is pressed. */
  onSubmit?: (
    payload: ReturnType<typeof buildViewSubmissionPayload>,
    context: { views: ViewsApi },
  ) => SubmitResult | Promise<SubmitResult>;
  /** Called with a `view_closed` payload when a `<Modal>`'s close (X) button is pressed. */
  onClose?: (payload: ReturnType<typeof buildViewClosedPayload>) => void;
  resolvers: Resolvers;
  emoji: EmojiOptions;
  /** Validation errors keyed by block_id, as returned in `response_action: "errors"`. */
  errors: Record<string, string>;
  /** IANA zone for `<!date>` tokens and date elements. Undefined means the viewer's zone. */
  timeZone?: string;
  state: StateValues;
  /** Records an element's current value. Elements call this on every change. */
  setValue: (blockId: string, actionId: string, value: ElementState | undefined) => void;
  /**
   * Reports an action, passing the current state along. `scope` is the surface it happened in;
   * surfaces bind it for their elements, so elements never pass it themselves.
   */
  dispatch: (
    action: Partial<Pick<BlockAction, "action_ts">> & Omit<BlockAction, "action_ts">,
    scope?: SurfaceScopeValue,
  ) => void;
  /** Identity fields (team/user/trigger_id/...) used to build full Slack payloads. */
  identity: PayloadIdentity;
  /**
   * Registers the message/view a surface is rendering, so `dispatch` can build a full
   * `block_actions` payload for `onPayload`. Surfaces call this via `useContainer`; not meant to
   * be called directly.
   */
  setContainer: (container: Container | undefined) => void;
  views: ViewsApi;
  /**
   * Asks the app for an `external_select`'s options with a `block_suggestion` payload. Resolves
   * to undefined when there's no `onOptions` handler or no known container.
   */
  loadOptions?: (
    actionId: string,
    blockId: string,
    value: string,
    scope?: SurfaceScopeValue,
  ) => Promise<OptionsResponse | undefined>;
  /** Set on a modal opened through `views`: the stack entry it renders. */
  stackedView?: StackedView;
  /** Applies a submit's `response_action` (or closes) for a stacked modal. */
  respond?: (viewId: string, result: SubmitResult) => void;
}

const noop = () => {};
const noopId = () => "";
const noopViews: ViewsApi = {
  open: noopId,
  push: noopId,
  update: noop,
  close: noop,
  clear: noop,
  publish: noop,
};

const BlockKitContext = createContext<BlockKitContextValue>({
  surface: "message",
  resolvers: {},
  emoji: {},
  errors: {},
  state: {},
  setValue: noop,
  dispatch: noop,
  identity: {},
  setContainer: noop,
  views: noopViews,
});

export interface BlockKitProviderProps {
  children: ReactNode;
  surface?: Surface;
  onAction?: (action: BlockAction, context: ActionContext) => void;
  /**
   * Same actions as `onAction`, wrapped in the full Slack `block_actions` payload (team, user,
   * container, response_url, ...) that an app's request URL would receive. Requires the surface
   * being rendered (`<Message>`, `<Modal>`, `<HomeTab>`) to know its container, which they do
   * automatically.
   */
  onPayload?: (
    payload: ReturnType<typeof buildBlockActionsPayload>,
    context: PayloadContext,
  ) => void;
  /**
   * Called with a `view_submission` payload when a `<Modal>`'s Submit button is pressed. For a
   * modal opened through `views`, return a `response_action` (`errors`, `update`, `push`,
   * `clear`) to react as Slack would, or nothing to close it. If it throws or rejects (the app
   * couldn't be reached), the modal stays open.
   */
  onSubmit?: (
    payload: ReturnType<typeof buildViewSubmissionPayload>,
    context: { views: ViewsApi },
  ) => SubmitResult | Promise<SubmitResult>;
  /** Called with a `view_closed` payload when a `<Modal>`'s close (X) button is pressed. */
  onClose?: (payload: ReturnType<typeof buildViewClosedPayload>) => void;
  /**
   * Answers an `external_select`'s `block_suggestion` request with options, as an app's options
   * load URL would. Without it, external selects accept a typed value on Enter instead.
   */
  onOptions?: (payload: BlockSuggestionPayload) => OptionsResponse | Promise<OptionsResponse>;
  /** Called whenever an input value changes, with the full `state.values`. */
  onStateChange?: (state: StateValues) => void;
  resolvers?: Resolvers;
  emoji?: EmojiOptions;
  errors?: Record<string, string>;
  timeZone?: string;
  /** Team/user/trigger_id/... stamped onto payloads built for `onPayload`/`onSubmit`/`onClose`. */
  identity?: PayloadIdentity;
  /** Sets `data-theme` on a wrapper div so Slack's dark-mode CSS variables (Message.css) apply. */
  theme?: "light" | "dark";
}

/** Slack allows at most 3 views in a modal stack. */
const MAX_STACK = 3;

function newViewId(): string {
  return `V${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, "0")}`;
}

function newHash(): string {
  return `${Math.floor(Date.now() / 1000)}.${Math.random().toString(36).slice(2, 10)}`;
}

export function BlockKitProvider(props: BlockKitProviderProps) {
  const {
    children,
    surface = "message",
    onAction,
    onPayload,
    onSubmit,
    onClose,
    onOptions,
    onStateChange,
    resolvers,
    emoji,
    errors,
    timeZone,
    identity,
    theme,
  } = props;
  const [state, setState] = useState<StateValues>({});
  // Actions read the latest state synchronously, even when fired in the same tick as a change.
  const stateRef = useRef(state);
  // The message/view currently rendered, registered by `useContainer`. A ref (not state): it's
  // read only from event handlers, so updating it should never trigger a re-render.
  const containerRef = useRef<Container | undefined>(undefined);

  // A modal opened through `views` renders in a nested provider (so it gets its own state); that
  // provider shares the root's stack instead of starting its own.
  const parent = useContext(StackContext);
  const [stack, setStack] = useState<StackedView[]>([]);
  const stackRef = useRef(stack);
  const commitStack = useCallback((next: StackedView[]) => {
    stackRef.current = next;
    setStack(next);
  }, []);

  // Views rendered outside the stack (`<HomeTab>`, a standalone `<Modal>`), so `views.update`
  // and `views.publish` can reach them.
  const handlesRef = useRef<ViewHandle[]>([]);
  const register = useCallback((handle: ViewHandle) => {
    handlesRef.current = [...handlesRef.current, handle];
    return () => {
      handlesRef.current = handlesRef.current.filter((h) => h !== handle);
    };
  }, []);

  const ownViews = useMemo<ViewsApi>(() => {
    const stamp = (view: ViewLike, below: StackedView | undefined): StackedView["view"] => {
      const id = newViewId();
      return {
        ...view,
        id,
        hash: newHash(),
        root_view_id: below?.view.root_view_id ?? id,
        previous_view_id: below?.view.id ?? null,
      };
    };
    const findIndex = (target?: { viewId?: string; externalId?: string }) => {
      const views = stackRef.current;
      if (target?.viewId) return views.findIndex((v) => v.view.id === target.viewId);
      if (target?.externalId) {
        return views.findIndex((v) => v.view.external_id === target.externalId);
      }
      return views.length - 1;
    };
    return {
      open: (view) => {
        const next = { view: stamp(view, undefined), errors: {} };
        commitStack([next]);
        return next.view.id;
      },
      push: (view) => {
        const views = stackRef.current;
        if (views.length >= MAX_STACK) {
          console.warn(`views.push: Slack allows at most ${MAX_STACK} views in a stack.`);
          return "";
        }
        const next = { view: stamp(view, views[views.length - 1]), errors: {} };
        commitStack([...views, next]);
        return next.view.id;
      },
      update: (view, target) => {
        const i = findIndex(target);
        const current = stackRef.current[i];
        if (!current) {
          const handles = handlesRef.current;
          const handle = target?.viewId
            ? handles.find((h) => h.current().id === target.viewId)
            : target?.externalId
              ? handles.find((h) => h.current().external_id === target.externalId)
              : handles[handles.length - 1];
          handle?.update(view);
          return;
        }
        const next = [...stackRef.current];
        next[i] = {
          view: {
            ...view,
            id: current.view.id,
            hash: newHash(),
            root_view_id: current.view.root_view_id,
            previous_view_id: current.view.previous_view_id,
          },
          errors: {},
        };
        commitStack(next);
      },
      close: () => commitStack(stackRef.current.slice(0, -1)),
      clear: () => commitStack([]),
      publish: (view) => {
        const homes = handlesRef.current.filter((h) => h.current().type === "home");
        if (homes.length === 0) console.warn("views.publish: no <HomeTab> is rendered.");
        for (const home of homes) home.update(view);
      },
    };
  }, [commitStack]);

  const views = parent?.views ?? ownViews;

  const ownRespond = useCallback(
    (viewId: string, result: SubmitResult) => {
      const i = stackRef.current.findIndex((v) => v.view.id === viewId);
      if (i < 0) return;
      if (!result) {
        commitStack(stackRef.current.filter((v) => v.view.id !== viewId));
      } else if (result.response_action === "errors") {
        const next = [...stackRef.current];
        next[i] = { ...(next[i] as StackedView), errors: result.errors };
        commitStack(next);
      } else if (result.response_action === "update") {
        ownViews.update(result.view, { viewId });
      } else if (result.response_action === "push") {
        ownViews.push(result.view);
      } else if (result.response_action === "clear") {
        ownViews.clear();
      }
    },
    [commitStack, ownViews],
  );

  const respond = parent?.respond ?? ownRespond;

  const setValue = useCallback(
    (blockId: string, actionId: string, value: ElementState | undefined) => {
      const block = { ...stateRef.current[blockId] };
      if (value === undefined) delete block[actionId];
      else block[actionId] = value;
      const next = { ...stateRef.current, [blockId]: block };
      stateRef.current = next;
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const setContainer = useCallback((container: Container | undefined) => {
    containerRef.current = container;
  }, []);

  const dispatch = useCallback<BlockKitContextValue["dispatch"]>(
    (action, scope) => {
      const full = { ...action, action_ts: action.action_ts ?? actionTs() } as BlockAction;
      const message = scope?.message;
      onAction?.(full, { state: stateRef.current, views, message });
      const container = scope?.container ?? containerRef.current;
      if (onPayload && container) {
        onPayload(
          buildBlockActionsPayload({ action: full, state: stateRef.current, container, identity }),
          { views, message },
        );
      }
    },
    [onAction, onPayload, identity, views],
  );

  // Read through a ref so an inline `onOptions` (a new function every render) doesn't change
  // loadOptions' identity and re-fire the select's options request after every parent render.
  const optionsRef = useRef({ onOptions, identity });
  optionsRef.current = { onOptions, identity };
  const loadOptions = useCallback<NonNullable<BlockKitContextValue["loadOptions"]>>(
    async (actionId, blockId, value, scope) => {
      const { onOptions, identity } = optionsRef.current;
      const container = scope?.container ?? containerRef.current;
      if (!onOptions || !container) return undefined;
      return onOptions(
        buildBlockSuggestionPayload({
          actionId,
          blockId,
          value,
          container,
          state: stateRef.current,
          identity,
        }),
      );
    },
    [],
  );

  const stackedView = useContext(StackEntryContext);
  const value = useMemo<BlockKitContextValue>(
    () => ({
      surface,
      onAction,
      onPayload,
      onSubmit,
      onClose,
      resolvers: resolvers ?? {},
      emoji: emoji ?? {},
      errors: stackedView?.errors ?? errors ?? {},
      timeZone,
      state,
      setValue,
      dispatch,
      identity: identity ?? {},
      setContainer,
      views,
      loadOptions: onOptions ? loadOptions : undefined,
      stackedView,
      respond,
    }),
    [
      surface,
      onAction,
      onPayload,
      onSubmit,
      onClose,
      resolvers,
      emoji,
      errors,
      timeZone,
      state,
      setValue,
      dispatch,
      identity,
      setContainer,
      views,
      onOptions,
      loadOptions,
      stackedView,
      respond,
    ],
  );

  const registerView = parent?.register ?? register;
  const stackValue = useMemo(
    () => ({ views, respond, register: registerView }),
    [views, respond, registerView],
  );
  const content = (
    <>
      {children}
      {!parent && stack.length > 0 && (
        <ModalLayer
          stack={stack}
          renderEntry={(entry) => (
            <StackEntryContext.Provider value={entry}>
              <BlockKitProvider {...props} surface="modal" theme={undefined}>
                <Modal view={entry.view as ModalView} />
              </BlockKitProvider>
            </StackEntryContext.Provider>
          )}
        />
      )}
    </>
  );

  return (
    <BlockKitContext.Provider value={value}>
      <StackContext.Provider value={stackValue}>
        {theme ? <div data-theme={theme}>{content}</div> : content}
      </StackContext.Provider>
    </BlockKitContext.Provider>
  );
}

/** A view rendered outside the modal stack, as `views.update`/`views.publish` see it. */
interface ViewHandle {
  current: () => ViewLike;
  update: (view: ViewLike) => void;
}

const StackContext = createContext<
  | {
      views: ViewsApi;
      respond: (viewId: string, result: SubmitResult) => void;
      register: (handle: ViewHandle) => () => void;
    }
  | undefined
>(undefined);

const StackEntryContext = createContext<StackedView | undefined>(undefined);

export function useBlockKit(): BlockKitContextValue {
  return useContext(BlockKitContext);
}

/**
 * Registers the message/view a surface (`<Message>`, `<Modal>`, `<HomeTab>`) is rendering, so
 * `dispatch` can build a full `block_actions` payload for the provider's `onPayload`. Call once
 * near the top of a surface component; re-call (it's cheap) whenever the container's identity
 * changes.
 */
export function useContainer(container: Container | undefined): void {
  const { setContainer } = useBlockKit();
  useEffect(() => {
    setContainer(container);
  });
}

export interface SurfaceScopeProps extends SurfaceScopeValue {
  /** Extra validation errors (by block_id) shown on top of the provider's. */
  errors?: Record<string, string>;
  children: ReactNode;
}

/**
 * Binds the elements below it to one surface: their actions and options requests carry this
 * container (and message handle), even when several surfaces share a provider. `<Message>`,
 * `<Modal>` and `<HomeTab>` render one; custom surfaces can too.
 */
export function SurfaceScope({ container, message, errors, children }: SurfaceScopeProps) {
  const context = useBlockKit();
  const scopeRef = useRef<SurfaceScopeValue>({ container, message });
  scopeRef.current = { container, message };
  // Keeps the old container registration working for code that reads it (e.g. custom elements
  // calling the provider's dispatch directly).
  useContainer(container);
  const { dispatch, loadOptions } = context;
  // A standalone <Modal>/<HomeTab> is that surface even under a provider set up for messages.
  const surface: Surface = container.type === "view" ? container.view.type : "message";
  const scopedDispatch = useCallback<BlockKitContextValue["dispatch"]>(
    (action, scope) => dispatch(action, scope ?? scopeRef.current),
    [dispatch],
  );
  const scopedLoadOptions = useMemo<BlockKitContextValue["loadOptions"]>(
    () =>
      loadOptions &&
      ((actionId, blockId, value, scope) =>
        loadOptions(actionId, blockId, value, scope ?? scopeRef.current)),
    [loadOptions],
  );
  const value = useMemo<BlockKitContextValue>(
    () => ({
      ...context,
      surface,
      dispatch: scopedDispatch,
      loadOptions: scopedLoadOptions,
      errors:
        errors && Object.keys(errors).length > 0
          ? { ...context.errors, ...errors }
          : context.errors,
    }),
    [context, surface, scopedDispatch, scopedLoadOptions, errors],
  );
  return <BlockKitContext.Provider value={value}>{children}</BlockKitContext.Provider>;
}

/**
 * The view a `<HomeTab>` or standalone `<Modal>` should show: its `view` prop, or what the app
 * last sent with `views.update`/`views.publish`. A new `view` prop (by content) wins again.
 */
export function useLiveView<V extends ViewLike>(
  view: V,
  enabled = true,
): { view: V; update: (next: ViewLike) => void } {
  const shared = useContext(StackContext);
  const source = JSON.stringify(view);
  const [override, setOverride] = useState<{ source: string; view: V }>();
  const live = override?.source === source ? override.view : view;
  const liveRef = useRef(live);
  liveRef.current = live;

  const update = useCallback(
    (next: ViewLike) => {
      const current = liveRef.current;
      setOverride({
        source,
        view: {
          ...next,
          type: current.type,
          id: current.id,
          hash: newHash(),
          root_view_id: current.root_view_id,
          previous_view_id: current.previous_view_id,
        } as V,
      });
    },
    [source],
  );

  useEffect(() => {
    if (!enabled || !shared) return;
    return shared.register({ current: () => liveRef.current, update });
  }, [enabled, shared, update]);

  return { view: live, update };
}

/** Slack's `action_ts` format: seconds with microseconds. */
export function actionTs(now = Date.now()): string {
  return (now / 1000).toFixed(6);
}
