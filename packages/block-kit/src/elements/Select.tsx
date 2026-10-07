import type { OptionGroup, PlainTextOption } from "@slack/types";
import { useContext, useEffect, useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { ChannelHashIcon, ChevronDownIcon, CloseIcon, LockIcon, SearchIcon } from "../icons";
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
    dispatch({
      type: element.type,
      action_id: actionId,
      block_id: blockId,
      ...fields,
      // Slack echoes a select's placeholder back in the action.
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
  const visibleGroups: OptionGroupView[] = remote
    ? (remoteGroups ?? [])
    : source !== "static"
      ? []
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
  // Slack's single static select is typed into (`c-select_input`): the field filters the options,
  // so there's no search box in the menu. The others open from a button.
  const typeable = source === "static" && !multi;
  // As a section accessory, Slack's multi_static_select is a small button ("Select options", then
  // "N selected") that opens a "Select options" dialog and sends once, on Confirm.
  const inAccessory = useContext(SectionAccessoryContext);
  const inInputBlock = useInInputBlock();
  const dialogMode = inAccessory && multi && source === "static";
  const [dialogOpen, setDialogOpen] = useState(false);

  const combo = useCombobox({
    open,
    onOpenChange: setOpen,
    query,
    onQueryChange: setQuery,
    count: flatOptions.length,
    initialIndex: Math.max(0, flatOptions.findIndex(isSelected)),
    onChoose: (i) => {
      const option = flatOptions[i];
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
    typedHighlight: true,
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
  const placeholder = element.placeholder?.text ?? "Select an item";

  // What the list says when it has no rows to offer: Slack's minimum-query hint for a search that
  // hasn't started, else "Nothing could be found."
  const searchesApp = source === "external";
  const belowMinimum = searchesApp && minQueryLength > 0 && query.length < minQueryLength;
  const emptyMessage = belowMinimum
    ? `Type a minimum of ${minQueryLength} characters to see options.`
    : !loading && flatOptions.length === 0 && (!remote || remoteGroups !== undefined)
      ? "nothing"
      : undefined;
  // In an input block, Slack's multi-select list is 22px wider than the field and starts 12px left.
  const wideMulti = multi && inInputBlock;

  const menu = open && (
    <Popover
      anchorRef={rootRef}
      onDismiss={() => combo.setOpen(false)}
      offsetX={typeable || wideMulti ? -12 : 0}
      gap={MENU_GAP}
    >
      <div
        className={`sbk-select__menu${typeable ? " sbk-select__menu--typeable" : ""}${wideMulti ? " sbk-select__menu--wide" : ""}`}
        role="listbox"
        id={combo.listId}
        ref={listRef}
      >
        {!typeable && (showSearchOnly || allOptions(element).length > 8) && (
          <div className="sbk-select__search">
            <SearchIcon />
            <input
              autoFocus
              className="sbk-select__search-input"
              placeholder={
                source === "static" || source === "external" ? "Search options" : `Search ${source}`
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        {!belowMinimum &&
          (() => {
            let index = 0;
            return visibleGroups.map((group, gi) => {
              const rows = group.options.map((option) => {
                const i = index++;
                return (
                  <SelectOption
                    key={option.value ?? i}
                    option={option}
                    selected={isSelected(option)}
                    check={multi && isSelected(option)}
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
            {emptyMessage === "nothing" ? (
              <span className="sbk-select__no-results">😕 Nothing could be found.</span>
            ) : (
              emptyMessage
            )}
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
            options={allOptions(element)}
            initial={items.flatMap((i) => (i.option ? [i.option] : []))}
            placeholder={placeholder}
            onCancel={closeDialog}
            onConfirm={async (selected) => {
              closeDialog();
              if (!(await ask())) return;
              await commit(selected.map(optionToItem));
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
    const overlay = display !== undefined && !open && !query;
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
              <span className="sbk-select__content-text">{display}</span>
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
      className={`sbk-select${multi ? " sbk-select--multi" : ""}${multi && items.length > 0 ? " sbk-select--chips" : ""}${sizeClass}`}
      ref={rootRef}
      onKeyDown={combo.onKeyDown}
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
      {menu}
      {dialog}
    </div>
  );
}

function SelectOption({
  option,
  selected,
  check,
  typed,
  onSelect,
  navProps,
}: {
  option: PlainTextOption;
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
        <span className="sbk-select__option-text">
          <Text text={option.text} />
        </span>
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
