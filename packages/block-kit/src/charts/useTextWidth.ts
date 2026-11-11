import { type RefObject, useEffect, useState } from "react";

/**
 * Measures `text` at `size` (a CSS font weight and size, such as "400 13px") in the element's font
 * family, and again whenever the page's fonts finish loading, since a web font can arrive after
 * the first measurement. Gives `estimate` on the server, before the first measurement and where
 * there's no canvas to measure with, so the server and the browser's first render agree.
 */
export function useTextWidth(
  ref: RefObject<HTMLElement | null>,
  text: string,
  size: string,
  estimate: number,
): number {
  const [width, setWidth] = useState<number | undefined>();

  useEffect(() => {
    const el = ref.current;
    const context =
      typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(0, 0).getContext("2d");
    if (!el || !context) return;
    const measure = () => {
      context.font = `${size} ${getComputedStyle(el).fontFamily}`;
      setWidth(context.measureText(text).width);
    };
    measure();
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", measure);
    return () => fonts?.removeEventListener?.("loadingdone", measure);
  }, [ref, text, size]);

  return width ?? estimate;
}
