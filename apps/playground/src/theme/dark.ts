import * as stylex from "@stylexjs/stylex";
import { color } from "./tokens.stylex";

export const darkTheme = stylex.createTheme(color, {
  bg: "#0a0a0a",
  well: "#050505",
  surface: "#141414",
  line: "rgb(250 250 250 / 0.1)",
  lineStrong: "rgb(250 250 250 / 0.18)",
  lineHover: "rgb(250 250 250 / 0.32)",
  ink: "#fafafa",
  muted: "#a3a3a3",
  accent: "#8aa5ff",
  accentWash: "rgb(138 165 255 / 0.14)",
  danger: "#ff8fa3",
  dangerBg: "#2a1217",
  // Slack's dark message background.
  frameBg: "#1a1d21",
  shadow: "0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6)",
  popupShadow: "0 4px 16px -4px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(250 250 250 / 0.12)",
  pressedShadow: "0 0 0 1px rgb(250 250 250 / 0.1), 0 1px 2px rgb(0 0 0 / 0.4)",
});
