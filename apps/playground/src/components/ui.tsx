import { Button as BaseButton } from "@base-ui/react/button";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { color } from "../theme/tokens.stylex";

export const focusRing = stylex.create({
  ring: {
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${color.accent}`,
    },
    outlineOffset: "2px",
  },
});

const button = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: color.lineStrong,
      ":hover": color.lineHover,
      ":disabled": color.lineStrong,
    },
    borderRadius: 8,
    backgroundColor: color.bg,
    color: { default: color.ink, ":disabled": color.muted },
    opacity: { default: 1, ":disabled": 0.6 },
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: { default: "pointer", ":disabled": "default" },
  },
});

/** A secondary action. The playground has no primary button: the preview is the point. */
export function Button({
  style,
  ...props
}: Omit<ComponentProps<typeof BaseButton>, "className" | "style"> & {
  style?: stylex.StyleXStyles;
}) {
  return <BaseButton {...props} {...stylex.props(button.base, focusRing.ring, style)} />;
}

/** A link that looks like a `Button`. */
export function ButtonLink({ children, ...props }: Omit<ComponentProps<"a">, "className">) {
  return (
    <a {...props} {...stylex.props(button.base, focusRing.ring)}>
      {children}
    </a>
  );
}

const segmented = stylex.create({
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    borderRadius: 9,
    backgroundColor: color.well,
    boxShadow: `inset 0 0 0 1px ${color.line}`,
  },
  stretch: {
    display: "flex",
  },
  item: {
    flexGrow: 0,
    height: 28,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 7,
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.ink, ":disabled": color.muted },
    opacity: { default: 1, ":disabled": 0.5 },
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    cursor: { default: "pointer", ":disabled": "default" },
  },
  itemStretch: {
    flexGrow: 1,
    height: 32,
  },
  pressed: {
    backgroundColor: color.bg,
    color: color.ink,
    boxShadow: color.pressedShadow,
  },
});

/** One of a few options, always one chosen: the surface and the phone's JSON/Preview switch. */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  stretch = false,
  style,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
  stretch?: boolean;
  style?: stylex.StyleXStyles;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      // A segmented control can't be emptied: pressing the chosen option again keeps it.
      onValueChange={(next) => {
        const picked = next[0];
        if (picked) onChange(picked as T);
      }}
      {...stylex.props(segmented.group, stretch && segmented.stretch, style)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={(state) =>
            stylex.props(
              segmented.item,
              stretch && segmented.itemStretch,
              focusRing.ring,
              state.pressed && segmented.pressed,
            ).className ?? ""
          }
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export const layout = stylex.create({
  toolbar: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 52,
    paddingBlock: 8,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
});

export const srOnly = stylex.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
