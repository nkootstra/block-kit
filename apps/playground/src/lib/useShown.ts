import { useState, useSyncExternalStore } from "react";

/** The playground's phone layout, as the components' `PHONE` media queries define it. */
const phone = () => matchMedia("(max-width: 800px)");

function subscribe(onChange: () => void) {
  const query = phone();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether a pane hidden on phones has been on screen yet. It stays true once it has, so what it
 * guards mounts on first sight and keeps its state after that.
 */
export function useShown(hiddenOnPhone: boolean): boolean {
  // The build's prerender (src/prerender.tsx) renders the wide layout; CSS hides the pane on phones.
  const isPhone = useSyncExternalStore(
    subscribe,
    () => phone().matches,
    () => false,
  );
  const visible = !(hiddenOnPhone && isPhone);
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);
  return shown || visible;
}
