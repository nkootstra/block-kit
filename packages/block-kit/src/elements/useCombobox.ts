import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
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
  onChoose,
  onSubmitQuery,
  listRef,
}: {
  /** What's typed; the owner filters its rows by it, so it owns the state. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Rows in the list for the current query. */
  count: number;
  /** The row highlighted when the list opens. */
  initialIndex: number;
  onChoose: (index: number) => void;
  /** Enter with no highlighted row, e.g. a typed value the list doesn't offer. */
  onSubmitQuery?: (query: string) => void;
  listRef: RefObject<HTMLElement | null>;
}) {
  const [open, setOpenState] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) onQueryChange("");
  }

  const nav = useMenuNavigation({
    open,
    count,
    initialIndex,
    onChoose,
    onClose: () => {
      setOpen(false);
      inputRef.current?.focus();
    },
    onOpen: () => setOpenState(true),
    listRef,
  });

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      if (open) setOpen(false);
      return;
    }
    if (open && e.key === "Enter" && nav.active < 0 && query.trim()) {
      e.preventDefault();
      onSubmitQuery?.(query.trim());
      return;
    }
    nav.onKeyDown(e);
  }

  /** Props for the input. `display` is the chosen value, shown while the list is closed. */
  function inputProps(display: string | undefined, placeholder: string) {
    return {
      ref: inputRef,
      type: "text",
      role: "combobox",
      autoComplete: "off",
      spellCheck: false,
      "aria-autocomplete": "list" as const,
      "aria-expanded": open,
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant": open && nav.active >= 0 ? optionId(nav.active) : undefined,
      "aria-label": placeholder,
      // While open, the chosen value stays visible as the placeholder until something is typed.
      placeholder: open ? (display ?? placeholder) : placeholder,
      value: open ? query : (display ?? ""),
      onClick: () => setOpenState(true),
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        onQueryChange(e.target.value);
        setOpenState(true);
        nav.setActive(0);
      },
      onKeyDown,
    };
  }

  /** Props for the row at `index`, tying it to the input's aria-activedescendant. */
  function optionProps(index: number) {
    return { id: optionId(index), ...nav.itemProps(index) };
  }

  return { open, setOpen, listId, inputRef, inputProps, optionProps, active: nav.active };
}
