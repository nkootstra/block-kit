import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the build's prerender (src/prerender.tsx) and while the browser hydrates it, true from
 * the render after. A component reads it to match the prerendered HTML first, then show what only
 * the browser knows: the viewport, the stored theme, the editor.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
