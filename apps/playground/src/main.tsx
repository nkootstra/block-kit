import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "@fontsource/roboto-mono/400.css";
import "@nkootstra/block-kit/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const params = new URLSearchParams(window.location.search);
const root = createRoot(document.getElementById("root") as HTMLElement);

// The visual harness's render page (?render) and the playground load separately, so neither
// pulls in the other: the render page needs every fixture, the playground only the examples.
if (params.has("render")) {
  void import("./RenderOnly").then(({ RenderOnly }) => {
    root.render(
      <StrictMode>
        <RenderOnly params={params} />
      </StrictMode>,
    );
  });
} else {
  void Promise.all([
    import("./App"),
    import("@base-ui/react/tooltip"),
    import("@fontsource-variable/geist"),
    import("@fontsource-variable/geist-mono"),
  ]).then(([{ App }, { Tooltip }]) => {
    root.render(
      <StrictMode>
        <Tooltip.Provider>
          <App />
        </Tooltip.Provider>
      </StrictMode>,
    );
  });
}
