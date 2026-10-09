import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color } from "../theme/tokens.stylex";
import type { ThemeChoice } from "../theme/useTheme";
import { focusRing } from "./ui";

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  {
    value: "light",
    label: "Light theme",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark theme",
    icon: (
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    ),
  },
  {
    value: "system",
    label: "Match system theme",
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
];

const styles = stylex.create({
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    marginLeft: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: 999,
    backgroundColor: color.surface,
  },
  button: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    padding: 0,
    borderWidth: 0,
    borderRadius: 999,
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    // 28px to look at, 44px to hit.
    "::after": {
      content: '""',
      position: "absolute",
      inset: "-8px -1px",
    },
  },
  pressed: {
    backgroundColor: color.bg,
    color: color.ink,
    boxShadow: color.pressedShadow,
  },
});

/** block-kit.dev's light/dark/system switch, sharing its stored choice. */
export function ThemeSwitch({
  value,
  onChange,
}: {
  value: ThemeChoice;
  onChange: (value: ThemeChoice) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Theme"
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0];
        if (picked) onChange(picked as ThemeChoice);
      }}
      {...stylex.props(styles.group)}
    >
      {OPTIONS.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={(state) =>
            stylex.props(styles.button, focusRing.ring, state.pressed && styles.pressed)
              .className ?? ""
          }
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {option.icon}
          </svg>
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
