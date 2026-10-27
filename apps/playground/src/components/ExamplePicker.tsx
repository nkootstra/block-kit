import * as stylex from "@stylexjs/stylex";
import { type PointerEvent, useState } from "react";
import type { Example } from "../examples";
import { color } from "../theme/tokens.stylex";
import { focusRing } from "./ui";

/** Where the picker's value is when the editor holds something that isn't an example. */
export const CUSTOM = "";

export interface PickerItem {
  value: string;
  label: string;
}

export interface PickerGroup {
  label: string;
  items: PickerItem[];
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

export const pickerStyles = stylex.create({
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
  search: {
    display: "block",
    boxSizing: "border-box",
    width: "calc(100% - 8px)",
    height: 32,
    marginInline: 4,
    marginBottom: 4,
    paddingInline: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.line,
    borderRadius: 6,
    backgroundColor: color.well,
    color: color.ink,
    fontFamily: "inherit",
    fontSize: 13,
    outline: "none",
    "::placeholder": { color: color.muted },
  },
  // The empty state stays in the DOM (it announces "No example matches" when it has text), so only
  // its text takes room.
  empty: {
    color: color.muted,
    fontSize: 13,
  },
  emptyText: {
    display: "block",
    paddingBlock: 8,
    paddingInline: 12,
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

export const matches = (item: PickerItem, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q);
};

export interface ExamplePickerProps {
  groups: PickerGroup[];
  value: string;
  onChange: (name: string) => void;
}

/** The trigger's label and icon, the same before and after the combobox loads. */
export function TriggerContent({ label }: { label: string | undefined }) {
  return (
    <>
      <span {...stylex.props(pickerStyles.value, !label && pickerStyles.placeholder)}>
        {label ?? "Your payload"}
      </span>
      <span {...stylex.props(pickerStyles.icon)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m7 15 5 5 5-5M7 9l5-5 5 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );
}

type Combobox = typeof import("./ExampleCombobox");
let combobox: Promise<Combobox> | undefined;
let loaded: Combobox | undefined;
const loadCombobox = () =>
  (combobox ??= import("./ExampleCombobox").then((module) => (loaded = module)));

/**
 * The example picker. Its combobox (Base UI's, with its search and positioning) is a large share
 * of the page's JavaScript and is only needed once the picker is used, so until then this renders
 * the same trigger as a plain button (a popup button rather than a combobox, which it can't be
 * yet) and loads it on the first hover, focus or press. Focus moves to the combobox's trigger,
 * and a press before it has loaded opens it when it has, as the press would have.
 */
export function ExamplePicker(props: ExamplePickerProps) {
  const [module, setModule] = useState(loaded);
  const [focused, setFocused] = useState(false);
  // How the picker was opened before the combobox loaded: "mouse", "touch", "pen" or "keyboard".
  const [openedBy, setOpenedBy] = useState<string | null>(null);
  const [pointerType, setPointerType] = useState("");

  if (module) {
    return <module.ExampleCombobox {...props} openedBy={openedBy} autoFocus={focused} />;
  }

  const load = () => void loadCombobox().then(setModule);
  const label = props.groups.flatMap((g) => g.items).find((i) => i.value === props.value)?.label;
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-haspopup="dialog"
      aria-label="Example"
      onPointerEnter={load}
      onPointerDown={(event: PointerEvent) => {
        setPointerType(event.pointerType);
        load();
      }}
      onFocus={() => {
        setFocused(true);
        load();
      }}
      onBlur={() => setFocused(false)}
      onClick={() => {
        setOpenedBy(pointerType || "keyboard");
        load();
      }}
      {...stylex.props(pickerStyles.trigger, focusRing.ring)}
    >
      <TriggerContent label={label} />
    </button>
  );
}
