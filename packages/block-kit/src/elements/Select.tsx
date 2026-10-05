import type { OptionGroup, PlainTextOption } from "@slack/types";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { ChannelHashIcon, ChevronDownIcon, CloseIcon, LockIcon, SearchIcon } from "../icons";
import type { OptionsResponse } from "../payloads";
import { Text } from "../Text";
import type { ElementProps, Json } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";
import { useInvalidProps } from "./inputBlockContext";
import { useMenuNavigation } from "./useMenuNavigation";
import { Popover } from "./Popover";

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
  useFocusOnLoad(element as { focus_on_load?: boolean }, triggerRef);
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

  const resolveLabel = (id: string): string => {
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
    dispatch({ type: element.type, action_id: actionId, block_id: blockId, ...fields });
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

  const filteredOptions =
    source === "static"
      ? allOptions(element).filter((o) => o.text.text.toLowerCase().includes(query.toLowerCase()))
      : [];

  // Visible static options, grouped as rendered, plus a flat list for keyboard navigation.
  const matches = (o: PlainTextOption) => o.text.text.toLowerCase().includes(query.toLowerCase());
  const visibleGroups: OptionGroupView[] = remote
    ? (remoteGroups ?? [])
    : source !== "static"
      ? []
      : element.option_groups
        ? element.option_groups.map((group) => ({
            label: group.label.text,
            options: (group.options as PlainTextOption[]).filter(matches),
          }))
        : [{ options: filteredOptions }];
  const flatOptions = visibleGroups.flatMap((g) => g.options);
  const isSelected = (option: PlainTextOption) =>
    items.some((i) => i.id === (option.value ?? option.text.text));

  const nav = useMenuNavigation({
    open,
    count: flatOptions.length,
    initialIndex: Math.max(0, flatOptions.findIndex(isSelected)),
    onChoose: (i) => {
      const option = flatOptions[i];
      if (option) selectItem(optionToItem(option));
    },
    onClose: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
    onOpen: () => setOpen(true),
    listRef,
  });

  const closedLabel = multi
    ? undefined
    : items[0]
      ? items[0].label || resolveLabel(items[0].id)
      : undefined;
  const placeholder = element.placeholder?.text ?? "Select an item";
  const showSearchOnly = source !== "static"; // external/users/conversations/channels have no local directory

  return (
    <div
      className={`sbk-select${multi ? " sbk-select--multi" : ""}${multi && items.length > 0 ? " sbk-select--chips" : ""}${sizeClass}`}
      ref={rootRef}
      onKeyDown={nav.onKeyDown}
    >
      {multi && element.max_selected_items && (
        <p className="sbk-select__max-info">
          You can select up to {element.max_selected_items}{" "}
          {element.max_selected_items === 1 ? "item" : "items"}.
        </p>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="sbk-select__control"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
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
        ) : (
          <span className="sbk-select__placeholder">{placeholder}</span>
        )}
        <ChevronDownIcon className="sbk-select__chevron" />
      </button>
      {open && (
        <Popover anchorRef={rootRef} onDismiss={() => setOpen(false)}>
          <div className="sbk-select__menu" role="listbox" ref={listRef}>
            {(showSearchOnly || allOptions(element).length > 8) && (
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && query.trim() && showSearchOnly && !remote) {
                      // No live directory to search against: typing an id/value and pressing
                      // enter selects it directly. This is our approximation for
                      // external/users/conversations/channels selects, documented in the brief.
                      selectItem({ id: query.trim(), label: resolveLabel(query.trim()) });
                    }
                  }}
                />
              </div>
            )}
            {(() => {
              let index = 0;
              return visibleGroups.map((group, gi) => {
                const rows = group.options.map((option) => {
                  const i = index++;
                  return (
                    <SelectOption
                      key={option.value ?? i}
                      option={option}
                      selected={isSelected(option)}
                      onSelect={() => selectItem(optionToItem(option))}
                      navProps={nav.itemProps(i)}
                    />
                  );
                });
                return group.label === undefined ? (
                  rows
                ) : (
                  <div className="sbk-select__group" key={gi}>
                    <div className="sbk-select__group-label">{group.label}</div>
                    {rows}
                  </div>
                );
              });
            })()}
            {remote && loading && <div className="sbk-select__status">Loading…</div>}
            {remote && !loading && remoteGroups !== undefined && flatOptions.length === 0 && (
              <div className="sbk-select__status">No results</div>
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
      )}
      {dialog}
    </div>
  );
}

function SelectOption({
  option,
  selected,
  onSelect,
  navProps,
}: {
  option: PlainTextOption;
  selected: boolean;
  onSelect: () => void;
  navProps?: ReturnType<ReturnType<typeof useMenuNavigation>["itemProps"]>;
}) {
  return (
    <div
      className={`sbk-select__option${selected ? " sbk-select__option--selected" : ""}`}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      {...navProps}
    >
      <span className="sbk-select__option-text">
        <Text text={option.text} />
      </span>
      {option.description && (
        <span className="sbk-select__option-description">
          <Text text={option.description} />
        </span>
      )}
    </div>
  );
}
