import type { LaunchOptions } from "playwright";

/**
 * How compare.ts starts Chromium, so a Linux run draws what a macOS run draws.
 *
 * The references were laid out on macOS, which places glyphs at fractional advances, and inline
 * those widths (a sender name is `width: 61.8594px`). Linux Chromium hints fonts by default, which
 * rounds the advances so the same text no longer fits its box and wraps. Turning hinting off gives
 * Linux macOS's metrics; without it every fixture in the Linux baseline was off by about 1%.
 *
 * Linux Chromium also draws text with subpixel (LCD) antialiasing, except in a compositing layer,
 * where it falls back to greyscale. Slack's markup and ours put different elements in layers, so
 * every glyph edge in our dialogs and popovers differed: `confirm/long-content@confirm` measured
 * 3.37% on Linux and 0.03% on macOS, whose headless Chromium never draws LCD text. Turning it off
 * draws all text in greyscale, as on macOS.
 */
export const LAUNCH_OPTIONS: LaunchOptions = {
  args: ["--font-render-hinting=none", "--disable-lcd-text"],
  ignoreDefaultArgs: ["--hide-scrollbars"],
};
