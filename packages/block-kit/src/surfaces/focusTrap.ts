import type { KeyboardEvent } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** The elements Tab can reach inside `container`, in document order (hidden ones left out). */
export function tabbables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest("[hidden]") && element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Keeps Tab inside a modal dialog: past the last control it wraps to the first, and Shift+Tab
 * before the first (or from the dialog itself) wraps to the last.
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  const items = tabbables(container);
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) {
    event.preventDefault();
    container.focus();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
