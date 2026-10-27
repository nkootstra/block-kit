import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "@fontsource/roboto-mono/400.css";
// The prerendered first screen (#prerender) is set in Geist, so its faces load with the page.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@nkootstra/block-kit/styles.css";
import "./app.css";
import { StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

const params = new URLSearchParams(window.location.search);
const root = createRoot(document.getElementById("root") as HTMLElement);

/** The build's HTML of the first screen (vite.config.ts), which the live app replaces. */
const prerendered = () => document.getElementById("prerender");

/** Removes the prerendered first screen in the commit that shows the app, so no frame has both. */
function Prerendered() {
  useLayoutEffect(() => prerendered()?.remove(), []);
  return null;
}

// The visual harness's render page (?render) and the playground load separately, so neither
// pulls in the other: the render page needs every fixture, the playground only the examples.
if (params.has("render")) {
  // The render page never shows the playground's first screen.
  prerendered()?.remove();
  void import("./RenderOnly").then(({ RenderOnly }) => {
    root.render(
      <StrictMode>
        <RenderOnly params={params} />
      </StrictMode>,
    );
  });
} else {
  void import("./App").then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
        <Prerendered />
      </StrictMode>,
    );
  });
}
