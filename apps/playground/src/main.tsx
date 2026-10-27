import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "@fontsource/roboto-mono/400.css";
// The prerendered first screen is set in Geist, so its faces load with the page.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@nkootstra/block-kit/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

const params = new URLSearchParams(window.location.search);
const container = document.getElementById("root") as HTMLElement;

// A built page holds the default example's first screen (vite.config.ts). The app hydrates it,
// unless the page shows something else: the render page, or a shared link's payload.
const hydrate =
  container.hasAttribute("data-prerendered") &&
  !params.has("render") &&
  !document.documentElement.hasAttribute("data-shared");
if (!hydrate) {
  container.replaceChildren();
  container.removeAttribute("data-prerendered");
}

// The visual harness's render page (?render) and the playground load separately, so neither
// pulls in the other: the render page needs every fixture, the playground only the examples.
if (params.has("render")) {
  void import("./RenderOnly").then(({ RenderOnly }) => {
    createRoot(container).render(
      <StrictMode>
        <RenderOnly params={params} />
      </StrictMode>,
    );
  });
} else {
  void import("./App").then(({ App }) => {
    const app = (
      <StrictMode>
        <App />
      </StrictMode>
    );
    if (!hydrate) {
      createRoot(container).render(app);
      return;
    }
    container.removeAttribute("data-prerendered");
    hydrateRoot(container, app);
  });
}
