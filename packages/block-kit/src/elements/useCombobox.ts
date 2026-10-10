import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useMenuNavigation } from "./useMenuNavigation";

/**
 * The typeable trigger Slack's select and time pickers share (`c-select_input`): a text input with
 * role="combobox" that shows the chosen value while closed, and the query while its list is open.
 * Typing filters the list and highlights its first row; the arrow keys move the highlight, Enter
 * picks it, Escape and Tab close the list and put the chosen value back.
 */
export function useCombobox({
  query,
  onQueryChange,
  count,
  initialIndex,
  clickedIndex = initialIndex,
  onChoose,
  onSubmitQuery,
  listRef,
  returnFocusRef,
  open: controlledOpen,
  onOpenChange,
  keepQuery = false,
  typedHighlight = false,
  highlightOnType = true,
  holdFirstArrow = true,
  chosenAsPlaceholder = true,
}: {
  /** What's typed; the owner filters its rows by it, so it owns the state. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Rows in the list for the current query. */
  count: number;
  /** The row highlighted when the list opens. */
  initialIndex: number;
  /**
   * The row highlighted when a click opens the list, if not `initialIndex`. Slack's multi-select
   * opens on a click with no row highlighted; the first arrow key highlights the first.
   */
  clickedIndex?: number;
  onChoose: (index: number) => void;
  /** Enter with no highlighted row, e.g. a typed value the list doesn't offer. */
  onSubmitQuery?: (query: string) => void;
  listRef: RefObject<HTMLElement | null>;
  /**
   * Where focus goes back to when Escape closes the list; the input by default. A select whose
   * trigger is a button (a multi-select, a directory search) passes the button.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Whether the list is open, for an owner that needs it before the hook runs; owned here if not. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Keep what was typed when the list closes, in the field and for the next open, as Slack's
   * select does after Escape or a press elsewhere. Otherwise closing clears it.
   */
  keepQuery?: boolean;
  /**
   * Slack's select lists start in a "typed" highlight (`--pseudo-active`: a grey row with an Enter
   * key) when the keyboard opens them and while you type; the first arrow key turns that same row
   * into the blue keyboard highlight, and later ones move it. A list opened with a click starts on
   * the blue highlight instead. `typed` reports which one is showing.
   */
  typedHighlight?: boolean;
  /**
   * Whether typing highlights the first row. Slack's time list doesn't: typing leaves it as it is
   * until an arrow key, and Enter reads the typed time.
   */
  highlightOnType?: boolean;
  /**
   * Whether the first arrow key stays on the typed highlight's row. Slack's does when the list
   * opens without a value or after typing, but opened on a chosen option it moves straight on.
   */
  holdFirstArrow?: boolean;
  /**
   * Whether the chosen value stays visible as the placeholder while the list is open. Slack's
   * single static select empties the field to its own placeholder instead.
   */
  chosenAsPlaceholder?: boolean;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpenState = onOpenChange ?? setOwnOpen;
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [typed, setTyped] = useState(true);
  // Set by a click that opens the list, which starts on the blue highlight rather than the typed one.
  const pointerOpen = useRef(false);
  useEffect(() => {
    if (open) setTyped(!pointerOpen.current);
    else pointerOpen.current = false;
  }, [open]);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next && !keepQuery) onQueryChange("");
  }

  const nav = useMenuNavigation({
    open,
    count,
    // Read as the list opens, after the click that opens it marks `pointerOpen`.
    initialIndex: pointerOpen.current ? clickedIndex : initialIndex,
    onChoose,
    onClose: () => {
      setOpen(false);
      (returnFocusRef ?? inputRef).current?.focus();
    },
    onOpen: () => setOpenState(true),
    listRef,
  });

  /** Keys for the input, or for a container around a button trigger and its list. */
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Tab") {
      if (open) setOpen(false);
      return;
    }
    if (open && e.key === "Enter" && nav.active < 0 && query.trim()) {
      e.preventDefault();
      onSubmitQuery?.(query.trim());
      return;
    }
    if (
      typedHighlight &&
      open &&
      typed &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
    ) {
      setTyped(false);
      // The first arrow key only turns the typed highlight into the keyboard one, on the same row.
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && nav.active >= 0 && holdFirstArrow) {
        e.preventDefault();
        return;
      }
    }
    nav.onKeyDown(e);
  }

  /** Props for the input. `display` is the chosen value, shown while the list is closed. */
  /** The combobox input's props; `label` names it for screen readers, else the placeholder does. */
  function inputProps(display: string | undefined, placeholder: string, label = placeholder) {
    return {
      ref: inputRef,
      type: "text",
      role: "combobox",
      autoComplete: "off",
      // The field's width comes from the flex layout around it; without this an input's default
      // 20-character intrinsic width becomes its minimum wherever `min-width` is left at `auto`.
      size: 1,
      spellCheck: false,
      "aria-autocomplete": "list" as const,
      "aria-expanded": open,
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant": open && nav.active >= 0 ? optionId(nav.active) : undefined,
      "aria-label": label,
      // While open, the chosen value stays visible as the placeholder until something is typed.
      placeholder: open && chosenAsPlaceholder ? (display ?? placeholder) : placeholder,
      value: open || (keepQuery && query) ? query : (display ?? ""),
      onClick: () => {
        if (!open) pointerOpen.current = true;
        setOpenState(true);
      },
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        pointerOpen.current = false;
        onQueryChange(e.target.value);
        setOpenState(true);
        setTyped(true);
        nav.setActive(highlightOnType ? 0 : -1);
      },
      onKeyDown,
    };
  }

  /** Props for the row at `index`, tying it to the input's aria-activedescendant. */
  function optionProps(index: number) {
    const item = nav.itemProps(index);
    return {
      id: optionId(index),
      ...item,
      // Moving the pointer over the list hands the highlight to it.
      onMouseMove: () => {
        if (typedHighlight) setTyped(false);
        item.onMouseMove();
      },
    };
  }

  return {
    open,
    setOpen,
    /** Opens or closes the list from a button trigger; a click opens it as `inputProps` does. */
    toggleFromTrigger(e: MouseEvent) {
      // A button's Enter or Space also clicks it, with no pointer behind it (`detail` 0).
      if (!open && e.detail > 0) pointerOpen.current = true;
      setOpenState(!open);
    },
    onKeyDown,
    listId,
    optionId,
    inputRef,
    inputProps,
    optionProps,
    active: nav.active,
    /** Whether the highlighted row is the typed highlight (with `typedHighlight`). */
    typed: typedHighlight && typed,
  };
}
