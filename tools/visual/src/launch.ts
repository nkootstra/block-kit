import type { LaunchOptions } from "playwright";

/**
 * How compare.ts starts Chromium, so a Linux run draws what a macOS run draws.
 *
 * The references were laid out on macOS, which places glyphs at fractional advances, and inline
 * those widths (a sender name is `width: 61.8594px`). Linux Chromium hints fonts by default, which
 * rounds the advances so the same text no longer fits its box and wraps. Turning hinting off gives
 * Linux macOS's metrics; without it every fixture in the Linux baseline was off by about 1%.
 */
export const LAUNCH_OPTIONS: LaunchOptions = {
  args: ["--font-render-hinting=none"],
  ignoreDefaultArgs: ["--hide-scrollbars"],
};
