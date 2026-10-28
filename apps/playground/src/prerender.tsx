import * as stylex from "@stylexjs/stylex";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { darkTheme } from "./theme/dark";

/**
 * The playground's first screen as HTML, for vite.config.ts to put in the built index.html: a slow
 * connection shows the default example before the JavaScript arrives, and `main.tsx` hydrates it
 * when it does. What only the browser knows waits for hydration (`useHydrated`). `darkClass` is the StyleX dark theme, which index.html applies before the
 * first paint the way `useTheme` does after it.
 */
export function render(): { html: string; darkClass: string } {
  return {
    html: renderToString(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
    darkClass: stylex.props(darkTheme).className ?? "",
  };
}
