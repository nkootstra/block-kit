import * as stylex from "@stylexjs/stylex";
import { color } from "../theme/tokens.stylex";
import type { ThemeChoice } from "../theme/useTheme";
import { ThemeSwitch } from "./ThemeSwitch";
import { focusRing } from "./ui";

const SITE_URL = "https://block-kit.dev";
const DOCS_URL = "https://docs.block-kit.dev";
const GITHUB_URL = "https://github.com/nkootstra/block-kit";

const PHONE = "@media (max-width: 800px)";
const NARROW = "@media (max-width: 1100px)";
const TINY = "@media (max-width: 380px)";

const styles = stylex.create({
  header: {
    display: "flex",
    alignItems: "center",
    gap: { default: 14, [PHONE]: 10 },
    paddingBlock: { default: 10, [PHONE]: 8 },
    paddingInline: { default: 20, [PHONE]: 16 },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
    backgroundColor: color.bg,
  },
  brand: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    color: color.ink,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  // On the smallest phones the logo stands in for the name, so About and the theme switch fit.
  brandName: {
    position: { default: "static", [TINY]: "absolute" },
    width: { default: "auto", [TINY]: 1 },
    height: { default: "auto", [TINY]: 1 },
    overflow: { default: "visible", [TINY]: "hidden" },
    clipPath: { default: "none", [TINY]: "inset(50%)" },
  },
  divider: {
    display: { default: "block", [PHONE]: "none" },
    flexShrink: 0,
    width: 1,
    height: 20,
    backgroundColor: color.lineStrong,
  },
  title: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    minWidth: 0,
    margin: 0,
    marginRight: "auto",
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  tagline: {
    display: { default: "inline", [NARROW]: "none" },
    overflow: "hidden",
    color: color.muted,
    fontWeight: 400,
    textOverflow: "ellipsis",
  },
  nav: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: 2,
  },
  link: {
    display: { default: "inline-flex", [PHONE]: "none" },
    alignItems: "center",
    minHeight: 36,
    paddingInline: 8,
    color: { default: color.muted, ":hover": color.ink },
    textDecoration: "none",
  },
  // About stays on phones, where Docs and GitHub hide: it's the only way to the about text there.
  about: {
    display: "inline-flex",
    borderWidth: 0,
    backgroundColor: "transparent",
    font: "inherit",
    cursor: "pointer",
  },
});

export function Header({
  theme,
  onThemeChange,
}: {
  theme: ThemeChoice;
  onThemeChange: (value: ThemeChoice) => void;
}) {
  return (
    <header {...stylex.props(styles.header)}>
      <a href={SITE_URL} {...stylex.props(styles.brand, focusRing.ring)}>
        <img src="/icon.svg" alt="" width="22" height="22" />
        <span {...stylex.props(styles.brandName)}>block-kit</span>
      </a>
      <span {...stylex.props(styles.divider)} aria-hidden="true" />
      <h1 {...stylex.props(styles.title)}>
        Playground
        <span {...stylex.props(styles.tagline)}>
          Edit Block Kit JSON and see it the way Slack renders it. No sign-in. Not affiliated with
          Slack.
        </span>
      </h1>
      <nav aria-label="Main" {...stylex.props(styles.nav)}>
        <a href={DOCS_URL} {...stylex.props(styles.link, focusRing.ring)}>
          Docs
        </a>
        <a href={GITHUB_URL} {...stylex.props(styles.link, focusRing.ring)}>
          GitHub
        </a>
        <button
          id="about-button"
          type="button"
          onClick={() => {
            // The about section is static HTML in index.html, so crawlers read it without the app.
            const about = document.getElementById("about");
            about?.setAttribute("data-open", "");
            about?.focus();
          }}
          {...stylex.props(styles.link, styles.about, focusRing.ring)}
        >
          About
        </button>
        <ThemeSwitch value={theme} onChange={onThemeChange} />
      </nav>
    </header>
  );
}
