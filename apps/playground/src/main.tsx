import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/900.css";
import "@fontsource/roboto-mono/400.css";
import "@nkootstra/block-kit/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RenderOnly } from "./RenderOnly";

const params = new URLSearchParams(window.location.search);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>{params.has("render") ? <RenderOnly params={params} /> : <App />}</StrictMode>,
);
