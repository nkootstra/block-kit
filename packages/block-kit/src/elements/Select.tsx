import type { OptionGroup, PlainTextOption } from "@slack/types";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { type DirectoryEntry, useBlockKit } from "../context";
import {
  CaretDownIcon,
  ChannelHashIcon,
  ChevronDownIcon,
  CloseIcon,
  LockIcon,
  SearchIcon,
} from "../icons";
import type { OptionsResponse } from "../payloads";
import { Text } from "../Text";
import type { ElementProps, Json } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInInputBlock, useInvalidProps } from "./inputBlockContext";
import { useCombobox } from "./useCombobox";
import { MENU_GAP, Popover } from "./Popover";
import { SectionAccessoryContext } from "./accessoryContext";
import { SelectDialog } from "./SelectDialog";

/**
 * One component renders every `*_select` element. The 5 data sources (static, external, users,
 * conversations, channels) and their `multi_` variants differ only in: what the closed control
 * shows, what the open menu offers, and the field names Slack uses in `state.values` /
 * `block_actions` (`selected_option(s)`, `selected_user(s)`, `selected_conversation(s)`,
 * `selected_channel(s)`).
 */

type Source = "static" | "external" | "users" | "conversations" | "channels";

export interface SelectElement extends Json {
  type: string;
  action_id?: string;
  placeholder?: { type: "plain_text"; text: string };
  options?: PlainTextOption[];
  option_groups?: OptionGroup[];
  min_query_length?: number;
  max_selected_items?: number;
  filter?: {
    include?: string[];
    exclude_external_shared_channels?: boolean;
    exclude_bot_users?: boolean;
  };
  default_to_current_conversation?: boolean;
  confirm?: import("@slack/types").ConfirmationDialog;
  initial_option?: PlainTextOption;
  initial_options?: PlainTextOption[];
  initial_user?: string;
  initial_users?: string[];
  initial_conversation?: string;
  initial_conversations?: string[];
  initial_channel?: string;
  initial_channels?: string[];
}

function parseType(type: string): { source: Source; multi: boolean } {
  const multi = type.startsWith("multi_");
  const base = multi ? type.slice("multi_".length) : type;
  const source = base.replace("_select", "") as Source;
  return { source, multi };
}

/** A selection, normalized to `{id, label}` regardless of data source. For static/external
 * selects `id` is the option's `value` and the full option is kept for the payload. */
interface Item {
  id: string;
  label: string;
  option?: PlainTextOption;
}

function optionToItem(option: PlainTextOption): Item {
  return { id: option.value ?? option.text.text, label: option.text.text, option };
}

/** Slack's field name for one selected item, by source and singular/plural. */
function fieldName(source: Source, plural: boolean): string {
  const names: Record<Source, [string, string]> = {
    static: ["selected_option", "selected_options"],
    external: ["selected_option", "selected_options"],
    users: ["selected_user", "selected_users"],
    conversations: ["selected_conversation", "selected_conversations"],
    channels: ["selected_channel", "selected_channels"],
  };
  return names[source][plural ? 1 : 0];
}

function itemToPayload(source: Source, item: Item): unknown {
  return source === "static" || source === "external" ? item.option : item.id;
}

function initialItems(element: SelectElement, source: Source, multi: boolean): Item[] {
  if (source === "static" || source === "external") {
    const options = multi
      ? element.initial_options
      : element.initial_option && [element.initial_option];
    return (options ?? []).map(optionToItem);
  }
  const key = { users: "user", conversations: "conversation", channels: "channel" }[source];
  const single = element[`initial_${key}` as keyof SelectElement] as string | undefined;
  const many = element[`initial_${key}s` as keyof SelectElement] as string[] | undefined;
  const ids = multi ? (many ?? []) : single ? [single] : [];
  // Leave `label` empty for directory-backed sources (users/conversations/channels) — there's no
  // label to show until it's resolved. Every read site falls back to `resolveLabel(id)` when
  // `label` is falsy; storing `id` here instead would short-circuit that fallback and always show
  // the raw id even when a resolver is configured.
  return ids.map((id) => ({ id, label: "" }));
}

function allOptions(element: SelectElement): PlainTextOption[] {
  if (element.options) return element.options;
  return (element.option_groups ?? []).flatMap((g) => g.options as PlainTextOption[]);
}

type OptionGroupView = { label?: string; options: PlainTextOption[] };

function responseGroups(response: OptionsResponse | undefined): OptionGroupView[] {
  if (!response) return [];
  if ("option_groups" in response) {
    return response.option_groups.map((group) => ({
      label: group.label.text,
      options: group.options as PlainTextOption[],
    }));
  }
  return [{ options: response.options as PlainTextOption[] }];
}

/**
 * Whether a conversations select's `filter` lets an entry through, as Slack applies it: `include`
 * names the kinds listed (`im` for people, `private` and `public` for channels; group DMs aren't in
 * the directory), and `exclude_bot_users` leaves out bots.
 */
function matchesConversationFilter(
  entry: DirectoryEntry,
  filter: SelectElement["filter"],
): boolean {
  if (!filter) return true;
  if (entry.type === "user" && entry.bot && filter.exclude_bot_users) return false;
  const include = filter.include;
  if (!include || include.length === 0) return true;
  const kind = entry.type === "user" ? "im" : entry.private ? "private" : "public";
  return include.includes(kind);
}

/**
 * Whether `text` matches what's typed, as Slack's lists filter: case-insensitively, at the start of
 * the text or of any word in it (after a space, hyphen, bracket or other punctuation), never in the
 * middle of a word.
 */
export function matchesQuery(text: string, query: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(t[i - 1]!)) return true;
  }
  return false;
}

/** Slack's default `min_query_length` for an `external_select`. */
const DEFAULT_MIN_QUERY_LENGTH = 3;
/** How long typing must pause before an `external_select` asks the app for options. */
const SUGGESTION_DEBOUNCE_MS = 250;

export function Select({ element, blockId }: ElementProps<SelectElement>) {
  const { setValue, dispatch, resolvers, surface, loadOptions } = useBlockKit();
  // Slack's Builder uses a taller "medium" control (36px) for a modal/Home tab surface than the
  // message-surface preview's 28px "small" control (independent of the multi-select bump below).
  const sizeClass = surface === "message" ? "" : " sbk-select--medium";
  const { ask, dialog } = useConfirm(element.confirm);
  const { source, multi } = parseType(element.type);
  const actionId = element.action_id ?? "";

  const [items, setItems] = useState<Item[]>(() => initialItems(element, source, multi));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const invalid = useInvalidProps();
  const listRef = useRef<HTMLDivElement>(null);

  // An `external_select` with an `onOptions` handler asks the app for options (a
  // `block_suggestion` request) once the query reaches `min_query_length`, as Slack does.
  const remote = source === "external" && loadOptions !== undefined;
  const minQueryLength = element.min_query_length ?? DEFAULT_MIN_QUERY_LENGTH;
  const [remoteGroups, setRemoteGroups] = useState<OptionGroupView[] | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !remote || !loadOptions) return;
    if (query.length < minQueryLength) {
      setRemoteGroups(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(
      async () => {
        try {
          const response = await loadOptions(actionId, blockId, query);
          if (!cancelled) setRemoteGroups(responseGroups(response));
        } catch {
          if (!cancelled) setRemoteGroups([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      query ? SUGGESTION_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, remote, loadOptions, query, minQueryLength, actionId, blockId]);

  // The app's directory for a users/conversations/channels select (`resolvers.directory`), the rows
  // Slack lists from the workspace.
  const entries: DirectoryEntry[] =
    source === "users" || source === "conversations" || source === "channels"
      ? (resolvers.directory?.(source) ?? []).filter(
          (e) => source !== "conversations" || matchesConversationFilter(e, element.filter),
        )
      : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const resolveLabel = (id: string): string => {
    const known = entryById.get(id);
    if (known) return known.name;
    const resolver =
      source === "users"
        ? resolvers.user
        : source === "channels" || source === "conversations"
          ? resolvers.channel
          : undefined;
    return resolver?.(id) ?? id;
  };

  /** Slack's own Builder preview can't resolve a fabricated id against the real directory, and
   * never shows the raw id: a channel becomes a "Private channel" pill, a user stays a loading
   * skeleton, and a conversation stays blank. */
  const isUnresolved = ({ id, label }: { id: string; label?: string }) =>
    !label &&
    (source === "users" || source === "channels" || source === "conversations") &&
    resolveLabel(id) === id;

  const privateChannel = (className: string) => (
    <span className={className}>
      <ChannelHashIcon className="sbk-select__channel-hash" />
      <span className="sbk-select__entity-text">
        <span className="sbk-select__missing-channel">
          <LockIcon />
          Private channel
        </span>
      </span>
    </span>
  );

  const unresolvedValue = (id: string) =>
    source === "channels" ? (
      privateChannel("sbk-select__value sbk-select__entity")
    ) : source === "users" ? (
      <span className="sbk-select__value sbk-select__skeleton" aria-label={id}>
        <span className="sbk-select__skeleton-avatar" />
        <span className="sbk-select__skeleton-name" />
      </span>
    ) : (
      <span className="sbk-select__value" aria-label={id} />
    );

  useEffect(() => {
    if (items.length > 0) {
      setValue(blockId, actionId, buildState());
    }
    // Only on mount: report the initial value, exactly like Slack does when the surface loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildState() {
    const field = fieldName(source, multi);
    const first = items[0];
    const value = multi
      ? items.map((i) => itemToPayload(source, i))
      : first
        ? itemToPayload(source, first)
        : undefined;
    return { type: element.type, [field]: value };
  }

  async function commit(next: Item[]) {
    setItems(next);
    const fields = buildStateFor(next);
    setValue(blockId, actionId, { type: element.type, ...fields });
    dispatch({
      type: element.type,
      action_id: actionId,
      block_id: blockId,
      ...fields,
      // Slack echoes a single select's initial_option and its placeholder back in the action.
      ...(!multi && element.initial_option ? { initial_option: element.initial_option } : {}),
      ...(element.placeholder ? { placeholder: element.placeholder } : {}),
    });
  }

  function buildStateFor(next: Item[]) {
    const field = fieldName(source, multi);
    const first = next[0];
    const value = multi
      ? next.map((i) => itemToPayload(source, i))
      : first
        ? itemToPayload(source, first)
        : undefined;
    return { [field]: value };
  }

  async function selectItem(item: Item) {
    if (!(await ask())) return;
    if (multi) {
      if (items.some((i) => i.id === item.id)) return;
      if (element.max_selected_items && items.length >= element.max_selected_items) return;
      await commit([...items, item]);
      setQuery("");
    } else {
      await commit([item]);
      setOpen(false);
      setQuery("");
    }
  }

  async function removeItem(id: string) {
    await commit(items.filter((i) => i.id !== id));
  }

  const matches = (o: PlainTextOption) => matchesQuery(o.text.text, query);
  const filteredOptions = source === "static" ? allOptions(element).filter(matches) : [];

  // Visible static options, grouped as rendered, plus a flat list for keyboard navigation.
  const directoryOptions: PlainTextOption[] = entries
    .filter(
      (e) =>
        matchesQuery(e.name, query) ||
        (e.type === "user" && e.realName !== undefined && matchesQuery(e.realName, query)),
    )
    .map((e) => ({ text: { type: "plain_text", text: e.name }, value: e.id }));
  // A chosen conversation, channel or person the directory doesn't list: Slack fetches it and lists
  // it first, selected, drawn as the field draws it (blank, a "Private channel" pill, a skeleton).
  const chosen = !multi && entries.length > 0 && !query ? items[0] : undefined;
  const pinned = chosen && !entryById.has(chosen.id) ? chosen : undefined;
  if (pinned) {
    directoryOptions.unshift({
      text: { type: "plain_text", text: pinned.label || resolveLabel(pinned.id) },
      value: pinned.id,
    });
  }
  const visibleGroups: OptionGroupView[] = remote
    ? (remoteGroups ?? [])
    : source !== "static"
      ? directoryOptions.length > 0 || entries.length > 0
        ? [{ options: directoryOptions }]
        : []
      : element.option_groups
        ? element.option_groups
            .map((group) => ({
              label: group.label.text,
              options: (group.options as PlainTextOption[]).filter(matches),
            }))
            // A group with nothing left to offer loses its header too.
            .filter((group) => group.options.length > 0)
        : [{ options: filteredOptions }];
  const flatOptions = visibleGroups.flatMap((g) => g.options);
  const isSelected = (option: PlainTextOption) =>
    items.some((i) => i.id === (option.value ?? option.text.text));

  const showSearchOnly = source !== "static"; // external/users/conversations/channels have no local directory
  // Slack's single static and external selects are typed into (`c-select_input`): the field filters
  // the options or searches the app, so there's no search box in the menu. The others open from a
  // button.
  // Slack's single users, conversations and channels selects are typed into the same way.
  // Its single static select is a button (`c-select_button`, Block Kit Builder since 9 October
  // 2026): the field shows the chosen option or the placeholder between dashes, and the list opens
  // on the chosen row, with a "--placeholder--" row first while nothing is chosen.
  const buttonSelect = source === "static" && !multi;
  const typeable = !multi && !buttonSelect;
  // As a section accessory, Slack's multi-selects are a small button (the placeholder, then
  // "N selected") that opens a selection dialog and sends once, on Confirm. Measured for static,
  // users and conversations selects; channels follow conversations, and the external one keeps its
  // list until Slack's is measured.
  const inAccessory = useContext(SectionAccessoryContext);
  const inInputBlock = useInInputBlock();
  const dialogMode = inAccessory && multi && source !== "external";
  const directory = source === "users" || source === "conversations" || source === "channels";
  /** An item as a dialog option: a directory id becomes an option labelled as it's shown. */
  const itemToOption = (item: Item): PlainTextOption =>
    item.option ?? {
      text: { type: "plain_text", text: item.label || resolveLabel(item.id) },
      value: item.id,
    };
  const [dialogOpen, setDialogOpen] = useState(false);

  const placeholder = element.placeholder?.text ?? "Select an item";
  const placeholderRow = buttonSelect && items.length === 0;
  /** The rows before the options: the button select's "--placeholder--" row. */
  const lead = placeholderRow ? 1 : 0;

  const combo = useCombobox({
    open,
    onOpenChange: setOpen,
    query,
    onQueryChange: setQuery,
    count: flatOptions.length + lead,
    // Slack's typed-into select opens on its first row even with an option chosen (Block Kit
    // Builder, `extra/modal/form@open`); the chosen one is marked with a check instead.
    // The button select opens on its chosen row, or on the "--placeholder--" row while nothing is
    // chosen.
    initialIndex: typeable || placeholderRow ? 0 : Math.max(0, flatOptions.findIndex(isSelected)),
    // Opened with a click, Slack's multi-select highlights no row (Block Kit Builder).
    clickedIndex: multi ? -1 : undefined,
    // Opened on a chosen option, Slack's first arrow key moves on from it (Block Kit Builder).
    holdFirstArrow: flatOptions.findIndex(isSelected) < 0 || query.trim() !== "",
    onChoose: (i) => {
      if (i < lead) {
        combo.setOpen(false);
        return;
      }
      const option = flatOptions[i - lead];
      if (option) selectItem(optionToItem(option));
    },
    // No live directory to search against: typing an id/value and pressing Enter selects it
    // directly, our approximation for external/users/conversations/channels selects.
    onSubmitQuery: (typed) => {
      if (showSearchOnly && !remote) selectItem({ id: typed, label: resolveLabel(typed) });
    },
    listRef,
    returnFocusRef: typeable ? undefined : triggerRef,
    keepQuery: typeable,
    // The button select opens on its blue highlight; the typed-into ones start on the grey one.
    typedHighlight: !buttonSelect,
    chosenAsPlaceholder: !typeable,
  });
  useFocusOnLoad<HTMLElement>(
    element as { focus_on_load?: boolean },
    typeable ? combo.inputRef : triggerRef,
  );

  const closedLabel = multi
    ? undefined
    : items[0]
      ? items[0].label || resolveLabel(items[0].id)
      : undefined;

  // What the list says when it has no rows to offer: Slack's minimum-query hint for a search that
  // hasn't started, else "Nothing could be found."
  const searchesApp = source === "external";
  const belowMinimum = searchesApp && minQueryLength > 0 && query.length < minQueryLength;
  const emptyMessage = belowMinimum
    ? `Type a minimum of ${minQueryLength} characters to see options.`
    : !loading && flatOptions.length === 0 && (!remote || remoteGroups !== undefined)
      ? "nothing"
      : undefined;
  // In an input block, Slack's multi-select and typed-into single select lists are 22px wider than
  // the field and start 12px left.
  const wideList = (multi || typeable || buttonSelect) && inInputBlock;

  const menu = open && (
    <Popover
      anchorRef={rootRef}
      onDismiss={() => combo.setOpen(false)}
      offsetX={typeable || buttonSelect || wideList ? -12 : 0}
      gap={MENU_GAP}
    >
      <div
        className={`sbk-select__menu${typeable || buttonSelect ? " sbk-select__menu--typeable" : ""}${wideList ? " sbk-select__menu--wide" : ""}`}
        role="listbox"
        id={combo.listId}
        ref={listRef}
      >
        {!typeable &&
          !buttonSelect &&
          ((showSearchOnly && entries.length === 0) ||
            (entries.length > 0 ? entries.length : allOptions(element).length) > 8) && (
            <div className="sbk-select__search">
              <SearchIcon />
              <input
                autoFocus
                className="sbk-select__search-input"
                placeholder={
                  source === "static" || source === "external"
                    ? "Search options"
                    : `Search ${source}`
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        {placeholderRow && (
          <SelectOption
            option={{ text: { type: "plain_text", text: `--${placeholder}--` } } as PlainTextOption}
            selected
            check
            onSelect={() => combo.setOpen(false)}
            navProps={combo.optionProps(0)}
          />
        )}
        {!belowMinimum &&
          (() => {
            let index = lead;
            return visibleGroups.map((group, gi) => {
              const rows = group.options.map((option) => {
                const i = index++;
                return (
                  <SelectOption
                    key={option.value ?? i}
                    option={option}
                    entry={option.value !== undefined ? entryById.get(option.value) : undefined}
                    content={
                      pinned && option.value === pinned.id && isUnresolved(pinned)
                        ? unresolvedValue(pinned.id)
                        : undefined
                    }
                    selected={isSelected(option)}
                    check={(multi || typeable || buttonSelect) && isSelected(option)}
                    typed={combo.typed && combo.active === i}
                    onSelect={() => selectItem(optionToItem(option))}
                    navProps={combo.optionProps(i)}
                  />
                );
              });
              return group.label === undefined ? (
                rows
              ) : (
                <div className="sbk-select__group" key={gi}>
                  {gi > 0 && <div className="sbk-select__divider" role="separator" />}
                  <div className="sbk-select__group-label">{group.label}</div>
                  {rows}
                </div>
              );
            });
          })()}
        {remote && loading && !belowMinimum && <div className="sbk-select__status">Loading…</div>}
        {emptyMessage && (
          <div
            className="sbk-select__option sbk-select__option--disabled"
            role="option"
            aria-disabled="true"
            aria-selected="false"
          >
            {/* Slack's `no-results-message`, the same faint text for both. */}
            <span className="sbk-select__no-results">
              {emptyMessage === "nothing" ? "😕 Nothing could be found." : emptyMessage}
            </span>
          </div>
        )}
        {showSearchOnly && items.length > 0 && multi && (
          <div className="sbk-select__group-label">Selected</div>
        )}
        {showSearchOnly &&
          multi &&
          items.map((item) => (
            <div className="sbk-select__option sbk-select__option--selected" key={item.id}>
              {item.label || resolveLabel(item.id)}
            </div>
          ))}
      </div>
    </Popover>
  );

  if (dialogMode) {
    const closeDialog = () => {
      setDialogOpen(false);
      triggerRef.current?.focus();
    };
    return (
      <div className={`sbk-select sbk-select--multi${sizeClass}`} ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          className="sbk-select__control"
          onClick={() => setDialogOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          {...invalid}
        >
          <span className="sbk-select__placeholder">
            {items.length > 0 ? `${items.length} selected` : placeholder}
          </span>
        </button>
        {dialogOpen && (
          <SelectDialog
            options={directory ? [] : allOptions(element)}
            initial={items.map(itemToOption)}
            placeholder={placeholder}
            addTyped={
              directory
                ? (typed) => itemToOption({ id: typed, label: resolveLabel(typed) })
                : undefined
            }
            onCancel={closeDialog}
            onConfirm={async (selected) => {
              closeDialog();
              if (!(await ask())) return;
              // A directory item keeps no label, so it's resolved wherever it's shown.
              await commit(
                selected.map((o) =>
                  directory ? { id: o.value ?? o.text.text, label: "" } : optionToItem(o),
                ),
              );
            }}
          />
        )}
        {dialog}
      </div>
    );
  }

  if (typeable) {
    const unresolved = items[0] !== undefined && isUnresolved(items[0]);
    const display = unresolved ? undefined : closedLabel;
    // Slack keeps the chosen option in the input but draws it in a layer over the field
    // (`c-select_input__content`), hiding the input's own text, until the list opens for typing.
    // An ID it can't resolve shows its "Private channel" pill or loading skeleton there instead.
    const overlay = (display !== undefined || unresolved) && !open && !query;
    return (
      <div className={`sbk-select sbk-select--typeable${sizeClass}`} ref={rootRef}>
        {/* A label, so a press on the chevron or padding lands in the input as on Slack's field. */}
        <label className="sbk-select__control">
          <input
            {...combo.inputProps(display, placeholder)}
            {...invalid}
            className={`sbk-select__input${overlay ? " sbk-select__input--behind" : ""}`}
          />
          <ChevronDownIcon className="sbk-select__chevron" />
          {overlay && (
            <span className="sbk-select__content" aria-hidden="true">
              {unresolved && items[0] ? (
                unresolvedValue(items[0].id)
              ) : (
                <span className="sbk-select__content-text">{display}</span>
              )}
            </span>
          )}
        </label>
        {menu}
        {dialog}
      </div>
    );
  }

  return (
    <div
      className={`sbk-select${buttonSelect ? " sbk-select--button" : ""}${multi ? " sbk-select--multi" : ""}${multi && items.length > 0 ? " sbk-select--chips" : ""}${sizeClass}`}
      ref={rootRef}
      onKeyDown={combo.onKeyDown}
    >
      {multi && element.max_selected_items && (
        <p className="sbk-select__max-info">
          {`You can select up to ${element.max_selected_items} ${element.max_selected_items === 1 ? "item" : "items"}.`}
        </p>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="sbk-select__control"
        onClick={(e) => {
          // Slack's button select takes focus on a click, so the arrow keys move its highlight;
          // Safari doesn't focus a clicked button by itself.
          if (buttonSelect) e.currentTarget.focus();
          combo.toggleFromTrigger(e);
        }}
        role={buttonSelect ? "combobox" : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={buttonSelect && open ? combo.listId : undefined}
        aria-activedescendant={
          buttonSelect && open && combo.active >= 0 ? combo.optionId(combo.active) : undefined
        }
        {...invalid}
      >
        {multi ? (
          items.length > 0 ? (
            <span className="sbk-select__chips">
              {items.map((item) => (
                <span className="sbk-select__chip" key={item.id}>
                  {source === "channels" && isUnresolved(item) ? (
                    privateChannel("sbk-select__chip-label sbk-select__chip-entity")
                  ) : (
                    <span className="sbk-select__chip-label">
                      <span className="sbk-select__chip-text">
                        <span>{item.label || resolveLabel(item.id)}</span>
                      </span>
                    </span>
                  )}
                  <span
                    className="sbk-select__chip-remove"
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${item.label || resolveLabel(item.id)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(item.id);
                    }}
                    // A role="button" span only gets clicks from the pointer; Enter and Space
                    // remove the chip too, and stop there so the select doesn't open.
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      removeItem(item.id);
                    }}
                  >
                    <CloseIcon />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="sbk-select__placeholder">{placeholder}</span>
          )
        ) : closedLabel ? (
          items[0] && isUnresolved(items[0]) ? (
            unresolvedValue(items[0].id)
          ) : (
            <span className="sbk-select__value">{closedLabel}</span>
          )
        ) : buttonSelect ? (
          <span className="sbk-select__value">{`--${placeholder}--`}</span>
        ) : (
          <span className="sbk-select__placeholder">{placeholder}</span>
        )}
        {buttonSelect ? (
          <CaretDownIcon className="sbk-select__chevron" />
        ) : (
          <ChevronDownIcon className="sbk-select__chevron" />
        )}
      </button>
      {menu}
      {dialog}
    </div>
  );
}

/** Slack's presence and channel icons, 20×20 paths copied from Block Kit Builder. */
const PRESENCE: Record<
  NonNullable<Extract<DirectoryEntry, { type: "user" }>["presence"]>,
  { label: string; d: string; evenOdd?: boolean }
> = {
  active: { label: "Active", d: "M14.5 10a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0" },
  snoozed: {
    label: "Active, notifications snoozed",
    evenOdd: true,
    d: "M11.25 3.5a.75.75 0 0 0 0 1.5h1.847l-2.411 2.756A.75.75 0 0 0 11.25 9h3.5a.75.75 0 0 0 0-1.5h-1.847l2.411-2.756A.75.75 0 0 0 14.75 3.5zM9.557 6.768C10.18 6.055 10 5.5 9.406 5.54a4.5 4.5 0 1 0 5.067 4.96H11.25a2.25 2.25 0 0 1-1.693-3.73",
  },
  slackbot: {
    label: "Active",
    evenOdd: true,
    d: "M9.73 6.173q.15.203.27.422.12-.218.27-.422C10.72 5.557 11.425 5 12.352 5c1.045 0 1.73.492 2.136 1.122.389.605.511 1.32.511 1.82 0 .486-.044 1.377-.681 2.513-.633 1.127-1.833 2.463-4.083 3.888a.44.44 0 0 1-.472 0c-2.25-1.425-3.45-2.76-4.083-3.888C5.044 9.319 5 8.428 5 7.94c0-.499.122-1.214.511-1.82C5.916 5.492 6.601 5 7.647 5c.927 0 1.632.557 2.084 1.173",
  },
};
const CHANNEL_HASH =
  "M9.74 2.878a.75.75 0 1 0-1.48-.255L7.68 6H3.75a.75.75 0 0 0 0 1.5h3.67L6.472 13H2.75a.75.75 0 0 0 0 1.5h3.463l-.452 2.623a.75.75 0 0 0 1.478.255l.496-2.878h3.228l-.452 2.623a.75.75 0 0 0 1.478.255l.496-2.878h3.765a.75.75 0 0 0 0-1.5h-3.506l.948-5.5h3.558a.75.75 0 0 0 0-1.5h-3.3l.54-3.122a.75.75 0 0 0-1.48-.255L12.43 6H9.2zM11.221 13l.948-5.5H8.942L7.994 13z";
const CHANNEL_LOCK =
  "M10 1.5A4.5 4.5 0 0 0 5.5 6v1.5h-.25A2.25 2.25 0 0 0 3 9.75v6.5c0 .966.784 1.75 1.75 1.75h10.5A1.75 1.75 0 0 0 17 16.25v-6.5a2.25 2.25 0 0 0-2.25-2.25h-.25V6A4.5 4.5 0 0 0 10 1.5m3 6V6a3 3 0 1 0-6 0v1.5zM4.5 9.75A.75.75 0 0 1 5.25 9h9.5a.75.75 0 0 1 .75.75v6.5a.25.25 0 0 1-.25.25H4.75a.25.25 0 0 1-.25-.25z";

/**
 * A person or channel in a directory-backed list, laid out as Slack's `c-member` and
 * `c-small_channel_entity` rows: a 20px avatar or 18px channel icon, 8px apart from the bold name,
 * then the person's "(you)" or badge, presence icon and full name.
 */
function DirectoryRow({ entry }: { entry: DirectoryEntry }) {
  if (entry.type === "channel") {
    return (
      <span className="sbk-select__member sbk-select__member--channel">
        <svg
          className="sbk-select__channel-icon"
          data-icon={entry.private ? "lock" : "hash"}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
            d={entry.private ? CHANNEL_LOCK : CHANNEL_HASH}
          />
        </svg>
        <span className="sbk-select__member-text">
          <span className="sbk-select__member-name">{entry.name}</span>
        </span>
      </span>
    );
  }
  const presence = entry.presence ? PRESENCE[entry.presence] : undefined;
  return (
    <span className="sbk-select__member">
      <span className="sbk-select__avatar">
        {entry.avatarUrl && <img src={entry.avatarUrl} alt="" />}
      </span>
      <span className="sbk-select__member-text">
        <span className="sbk-select__member-name">
          <strong>
            {entry.name}
            {entry.self && <span className="sbk-select__member-you">(you)</span>}
            {entry.badge && <span className="sbk-select__member-badge">{entry.badge}</span>}
          </strong>
        </span>
        {presence && (
          <svg
            className="sbk-select__presence"
            viewBox="0 0 20 20"
            role="img"
            aria-label={presence.label}
          >
            <path
              fill="currentColor"
              fillRule={presence.evenOdd ? "evenodd" : undefined}
              clipRule={presence.evenOdd ? "evenodd" : undefined}
              d={presence.d}
            />
          </svg>
        )}
        {entry.realName && <span className="sbk-select__member-secondary">{entry.realName}</span>}
      </span>
    </span>
  );
}

function SelectOption({
  option,
  entry,
  content,
  selected,
  check,
  typed,
  onSelect,
  navProps,
}: {
  option: PlainTextOption;
  /** A person or channel from `resolvers.directory`, shown as Slack's member or channel row. */
  entry?: DirectoryEntry;
  /** What to draw in place of the option's text, e.g. an unresolved ID's pill. */
  content?: ReactNode;
  selected: boolean;
  /** A multi-select's chosen option, which Slack ticks. */
  check?: boolean;
  /** The typed highlight, which shows an Enter key to pick it. */
  typed?: boolean;
  onSelect: () => void;
  navProps?: ReturnType<ReturnType<typeof useCombobox>["optionProps"]>;
}) {
  return (
    <div
      className={`sbk-select__option${selected ? " sbk-select__option--selected" : ""}`}
      role="option"
      aria-selected={selected}
      data-typed={typed || undefined}
      onClick={onSelect}
      {...navProps}
    >
      {check && (
        <svg
          className="sbk-select__check"
          viewBox="0 0 16 22"
          width="16"
          height="22"
          aria-hidden="true"
        >
          <path
            d="M4.5 11.2 7 13.7l4.5-5.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className="sbk-select__option-label">
        {content !== undefined ? (
          content
        ) : entry ? (
          <DirectoryRow entry={entry} />
        ) : (
          <span className="sbk-select__option-text">
            <Text text={option.text} />
          </span>
        )}
        {option.description && (
          <span className="sbk-select__option-description">
            <Text text={option.description} />
          </span>
        )}
      </span>
      {typed && (
        <span className="sbk-select__shortcut" aria-hidden="true">
          <span className="sbk-select__keycap">Enter</span>
        </span>
      )}
    </div>
  );
}
