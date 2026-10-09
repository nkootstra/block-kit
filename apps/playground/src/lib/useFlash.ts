import { useCallback, useEffect, useRef, useState } from "react";

/** A button label that reads "Copied" for a moment after it's used. */
export function useFlash(): [string | null, (key: string) => void] {
  const [flashed, setFlashed] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback((key: string) => {
    setFlashed(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlashed(null), 1500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [flashed, flash];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access can be refused (an insecure origin, a denied permission).
    return false;
  }
}
