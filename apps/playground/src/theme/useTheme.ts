import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useState } from "react";
import { useHydrated } from "../lib/useHydrated";
import { darkTheme } from "./dark";

export type ThemeChoice = "light" | "dark" | "system";

const DARK_CLASSES = (stylex.props(darkTheme).className ?? "").split(" ").filter(Boolean);
const media = () => matchMedia("(prefers-color-scheme: dark)");
// The build's prerender (src/prerender.tsx) runs without a page: it renders the system choice, light.
const browser = typeof document !== "undefined";

/**
 * The same light/dark/system choice as block-kit.dev, stored under the same key. The resolved theme
 * goes on <html>: `data-theme` for the package's own stylesheet, and the StyleX dark theme class
 * for the playground's tokens, so popups portalled to <body> get them too.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(
    () =>
      (browser
        ? (document.documentElement.dataset.themeChoice as ThemeChoice | undefined)
        : null) ?? "system",
  );
  const [systemDark, setSystemDark] = useState(() => browser && media().matches);
  const resolved: "light" | "dark" = choice === "system" ? (systemDark ? "dark" : "light") : choice;

  useEffect(() => {
    const query = media();
    const update = () => setSystemDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Before paint, so a dark page never shows the light chrome for a frame.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.themeChoice = choice;
    root.dataset.theme = resolved;
    for (const name of DARK_CLASSES) root.classList.toggle(name, resolved === "dark");
    // The page behind the app, seen when scrolling past either end (overscroll). Set here rather
    // than in app.css, whose body background the visual harness's render page relies on.
    const page = resolved === "dark" ? "#0a0a0a" : "#fff";
    root.style.backgroundColor = page;
    document.body.style.backgroundColor = page;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "dark" ? "#0a0a0a" : "#ffffff");
  }, [choice, resolved]);

  useEffect(() => {
    try {
      localStorage.setItem("theme", choice);
    } catch {
      // Remembering the choice is a convenience; without storage it resets on reload.
    }
  }, [choice]);

  // The prerender (src/prerender.tsx) shows the system choice: hydrate that, then show the stored one.
  const hydrated = useHydrated();
  return { choice: hydrated ? choice : "system", setChoice, resolved };
}
