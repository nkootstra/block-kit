import * as stylex from "@stylexjs/stylex";

/** block-kit.dev's tokens (apps/site/src/styles/site.css), so the sites read as one product. */
export const color = stylex.defineVars({
  bg: "#fff",
  well: "#f5f5f5",
  surface: "#fafafa",
  line: "rgb(10 10 10 / 0.1)",
  lineStrong: "rgb(10 10 10 / 0.16)",
  lineHover: "rgb(10 10 10 / 0.3)",
  ink: "#0a0a0a",
  muted: "#6b6b6b",
  accent: "#2f5be0",
  accentWash: "rgb(47 91 224 / 0.1)",
  danger: "#b4233c",
  dangerBg: "#fdeef1",
  // Slack's message background, so the preview sits on what it would sit on in Slack.
  frameBg: "#fff",
  shadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.08)",
  popupShadow: "0 4px 16px -4px rgb(0 0 0 / 0.12), 0 0 0 1px rgb(10 10 10 / 0.08)",
  pressedShadow: "0 0 0 1px rgb(10 10 10 / 0.1), 0 1px 2px rgb(0 0 0 / 0.06)",
});

export const font = stylex.defineVars({
  sans: '"Geist Variable", system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, monospace',
});
