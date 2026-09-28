import { useEffect, useRef, useState } from "react";

/** Tracks a container's content width via ResizeObserver, so charts can lay out to the real width. */
export function useContainerWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    // jsdom (used in tests) has no ResizeObserver; fall back to the static width there.
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
