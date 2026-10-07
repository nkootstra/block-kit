import { act, fireEvent } from "@testing-library/react";

/**
 * Every interactive element here funnels clicks through `useConfirm().ask()`, which always
 * returns a Promise (resolved immediately when there's no `confirm` dialog). Plain
 * `fireEvent.click` doesn't flush that microtask, so `dispatch`/`setValue` calls made after
 * `await ask()` are missed unless the click is wrapped in an async `act`.
 */
export async function clickAsync(element: Element | Node) {
  await act(async () => {
    fireEvent.click(element);
  });
}

/** Same rationale as {@link clickAsync}, for a keydown-triggered async handler (e.g. Select's
 * "type an id and press Enter" fallback for directory-backed sources). */
export async function keyDownAsync(element: Element | Node, key: string) {
  await act(async () => {
    fireEvent.keyDown(element, { key });
  });
}

/** Same rationale as {@link clickAsync}, for a handler that runs as focus leaves an element. */
export async function blurAsync(element: Element | Node) {
  await act(async () => {
    fireEvent.blur(element);
  });
}
