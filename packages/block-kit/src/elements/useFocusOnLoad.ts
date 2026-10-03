import { useEffect, useRef } from "react";
import { useBlockKit } from "../context";

/**
 * Slack's `focus_on_load`: the element takes focus when its modal or Home tab opens. Slack ignores
 * it in messages and allows it on only one element per view.
 *
 * Pass the element's own ref when it already has one; otherwise attach the returned ref. The return
 * type is `useRef`'s own, which differs between @types/react 18 and 19, so it fits a `ref` prop in
 * both.
 */
export function useFocusOnLoad<T extends HTMLElement>(
  element: { focus_on_load?: boolean },
  existing?: { readonly current: T | null },
) {
  const { surface } = useBlockKit();
  const own = useRef<T>(null);
  const ref = existing ?? own;
  const focus = element.focus_on_load === true && surface !== "message";
  useEffect(() => {
    if (focus) ref.current?.focus();
    // Only when the surface loads, like Slack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref as typeof own;
}
