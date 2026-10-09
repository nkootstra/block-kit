import { Select } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";
import type { Example } from "../examples";
import { color } from "../theme/tokens.stylex";
import { focusRing } from "./ui";

/** Where the picker's value is when the editor holds something that isn't an example. */
export const CUSTOM = "";

export interface PickerGroup {
  label: string;
  items: { value: string; label: string }[];
}

/** The curated examples by group, plus (in dev) every other fixture under "Test fixtures". */
export function pickerGroups(examples: Example[], testFixtures: string[]): PickerGroup[] {
  const groups: PickerGroup[] = [];
  for (const example of examples) {
    let group = groups.find((g) => g.label === example.group);
    if (!group) groups.push((group = { label: example.group, items: [] }));
    group.items.push({ value: example.name, label: example.label });
  }
  for (const name of testFixtures) {
    const label = `Test fixtures · ${fixtureGroup(name)}`;
    let group = groups.find((g) => g.label === label);
    if (!group) groups.push((group = { label, items: [] }));
    group.items.push({ value: name, label: fixtureLabel(name) });
  }
  return groups;
}

/** "card-and-carousel" → "Card and carousel". */
const humanize = (slug: string) => {
  const words = slug.replaceAll(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * A fixture's group, from its folders: `catalog/card-and-carousel/card` → "Card and carousel",
 * `extra/modal/form` → "Modal (extra)", and every generated `contexts/` fixture under one group.
 */
function fixtureGroup(name: string): string {
  const [root = "", folder] = name.split("/");
  if (!folder || name.split("/").length < 3) return humanize(root);
  if (root === "catalog") return humanize(folder);
  if (root === "contexts") return "Elements in each place";
  return `${humanize(folder)} (${root})`;
}

/**
 * A fixture's name within its group: `card-header-only` → "Card header only",
 * `contexts/button/accessory` → "Button as a section accessory", and a `.unverified` fixture is
 * marked as not checked against Slack.
 */
/** Where a generated `contexts/` fixture puts its element. */
const PLACES: Record<string, string> = {
  accessory: "as a section accessory",
  actions: "in an actions block",
  home: "on a Home tab",
  "modal-input": "in a modal input",
};

function fixtureLabel(name: string): string {
  const [root, element, place] = name.split("/");
  if (root === "contexts" && element && place) {
    return `${humanize(element)} ${PLACES[place] ?? humanize(place).toLowerCase()}`;
  }
  const leaf = name.split("/").at(-1) ?? name;
  const unverified = leaf.endsWith(".unverified");
  const base = humanize(leaf.replace(/\.unverified$/, ""));
  return unverified ? `${base} (not checked against Slack)` : base;
}

const PHONE = "@media (max-width: 800px)";

const styles = stylex.create({
  trigger: {
    display: "inline-flex",
    flexGrow: { default: 0, [PHONE]: 1 },
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: { default: 240, [PHONE]: "auto" },
    height: 32,
    paddingLeft: 10,
    paddingRight: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.lineStrong, ":hover": color.lineHover },
    borderRadius: 8,
    backgroundColor: color.bg,
    color: color.ink,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  value: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  placeholder: {
    color: color.muted,
  },
  icon: {
    display: "flex",
    flexShrink: 0,
    color: color.muted,
  },
  positioner: {
    zIndex: 10,
    outline: "none",
  },
  popup: {
    minWidth: "var(--anchor-width)",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    paddingBlock: 4,
    borderRadius: 10,
    backgroundColor: color.bg,
    color: color.ink,
    boxShadow: color.popupShadow,
    transformOrigin: "var(--transform-origin)",
    transitionProperty: "opacity, scale",
    transitionDuration: "120ms",
    transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
    outline: "none",
  },
  popupHidden: {
    opacity: 0,
    scale: 0.98,
  },
  group: {
    paddingBlock: 2,
  },
  groupLabel: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingInline: 12,
    color: color.muted,
    fontSize: 12,
    fontWeight: 500,
  },
  item: {
    display: "grid",
    gridTemplateColumns: "16px 1fr",
    alignItems: "center",
    gap: 6,
    marginInline: 4,
    paddingBlock: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 6,
    fontSize: 13,
    cursor: "default",
    userSelect: "none",
    outline: "none",
  },
  itemHighlighted: {
    backgroundColor: color.well,
  },
  check: {
    display: "flex",
    gridColumnStart: 1,
    color: color.accent,
  },
  itemText: {
    gridColumnStart: 2,
  },
});

export function ExamplePicker({
  groups,
  value,
  onChange,
}: {
  groups: PickerGroup[];
  value: string;
  onChange: (name: string) => void;
}) {
  const items = groups.flatMap((g) => g.items);
  return (
    <Select.Root
      items={items}
      value={value === CUSTOM ? null : value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <Select.Trigger aria-label="Example" {...stylex.props(styles.trigger, focusRing.ring)}>
        <Select.Value
          placeholder="Your payload"
          className={(state) =>
            stylex.props(styles.value, state.placeholder && styles.placeholder).className ?? ""
          }
        />
        <Select.Icon {...stylex.props(styles.icon)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m7 15 5 5 5-5M7 9l5-5 5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          {...stylex.props(styles.positioner)}
        >
          <Select.Popup
            className={(state) =>
              stylex.props(
                styles.popup,
                (state.transitionStatus === "starting" || state.transitionStatus === "ending") &&
                  styles.popupHidden,
              ).className ?? ""
            }
          >
            {groups.map((group) => (
              <Select.Group key={group.label} {...stylex.props(styles.group)}>
                <Select.GroupLabel {...stylex.props(styles.groupLabel)}>
                  {group.label}
                </Select.GroupLabel>
                {group.items.map((item) => (
                  <Select.Item
                    key={item.value}
                    value={item.value}
                    className={(state) =>
                      stylex.props(styles.item, state.highlighted && styles.itemHighlighted)
                        .className ?? ""
                    }
                  >
                    <Select.ItemIndicator {...stylex.props(styles.check)}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M20 6 9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Select.ItemIndicator>
                    <Select.ItemText {...stylex.props(styles.itemText)}>
                      {item.label}
                    </Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Group>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
