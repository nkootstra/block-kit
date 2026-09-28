import { type KeyboardEvent, type RefObject, useEffect, useState } from "react";

/**
 * Slack's menus and option lists keep one "active" row that follows both the pointer and the
 * arrow keys (`c-menu_item--highlighted` / `c-select_options_list__option--active`), so hover and
 * keyboard highlight share one style. Returns the active index plus handlers for the list.
 */
export function useMenuNavigation({
  open,
  count,
  initialIndex = -1,
  onChoose,
  onClose,
  onOpen,
  listRef,
}: {
  open: boolean;
  count: number;
  initialIndex?: number;
  onChoose: (index: number) => void;
  onClose: () => void;
  /** Called when an arrow key is pressed on the closed trigger. */
  onOpen?: () => void;
  /** The scrolling list; the active row is kept in view as the keyboard moves it. */
  listRef?: RefObject<HTMLElement | null>;
}) {
  const [active, setActive] = useState(-1);

  useEffect(() => {
    setActive(open ? initialIndex : -1);
    // Only reset when the menu opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (active >= count) setActive(count - 1);
  }, [active, count]);

  useEffect(() => {
    const row = listRef?.current?.querySelector<HTMLElement>("[data-active]");
    row?.scrollIntoView?.({ block: "nearest" });
  }, [active, listRef]);

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        onOpen?.();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (count === 0 ? -1 : (i + 1) % count));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (count === 0 ? -1 : i <= 0 ? count - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(count > 0 ? 0 : -1);
        break;
      case "End":
        e.preventDefault();
        setActive(count - 1);
        break;
      case "Enter":
        if (active >= 0 && active < count) {
          e.preventDefault();
          onChoose(active);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  /** Props for the row at `index`: pointer movement moves the highlight, like Slack's lists. */
  function itemProps(index: number) {
    return {
      onMouseEnter: () => setActive(index),
      onMouseMove: () => {
        if (active !== index) setActive(index);
      },
      "data-active": active === index || undefined,
    };
  }

  return { active, setActive, onKeyDown, itemProps };
}
