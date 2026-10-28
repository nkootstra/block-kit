import { Combobox } from "@base-ui/react/combobox";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useRef } from "react";
import {
  type ExamplePickerProps,
  matches,
  pickerStyles as styles,
  type PickerItem,
  TriggerContent,
} from "./ExamplePicker";
import { focusRing } from "./ui";

/**
 * The example picker's combobox, which `ExamplePicker` loads on first use. `openedBy` is how the
 * picker was opened before it loaded, if it was, and `autoFocus` keeps the focus the plain
 * trigger had.
 */
export function ExampleCombobox({
  groups,
  value,
  onChange,
  openedBy,
  autoFocus,
}: ExamplePickerProps & { openedBy: string | null; autoFocus: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  // Mounted in place of the plain trigger: keep the focus it had then.
  const focusOnMount = useRef(autoFocus);
  useLayoutEffect(() => {
    if (focusOnMount.current) trigger.current?.focus({ preventScroll: true });
  }, []);
  const items = groups.flatMap((g) => g.items);
  const selected = items.find((item) => item.value === value) ?? null;
  // Base UI's grouped items: each group carries its own `items`; the label rides along as `value`.
  const grouped = groups.map((g) => ({ value: g.label, items: g.items }));
  return (
    <Combobox.Root
      items={grouped}
      value={selected}
      onValueChange={(next) => {
        if (next) onChange(next.value);
      }}
      defaultOpen={openedBy !== null}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={matches}
    >
      <Combobox.Trigger
        ref={trigger}
        aria-label="Example"
        {...stylex.props(styles.trigger, focusRing.ring)}
      >
        <TriggerContent label={selected?.label} />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" {...stylex.props(styles.positioner)}>
          <Combobox.Popup
            // Opened by a tap, the list shows without focusing the search field, so a phone's
            // keyboard doesn't cover it; tapping the field brings the keyboard up to search.
            // An open from before this loaded has no open type of its own: use the plain trigger's.
            initialFocus={(openType) => (openType || openedBy) !== "touch"}
            className={(state) =>
              stylex.props(
                styles.popup,
                (state.transitionStatus === "starting" || state.transitionStatus === "ending") &&
                  styles.popupHidden,
              ).className ?? ""
            }
          >
            <Combobox.Input
              placeholder="Search examples"
              aria-label="Search examples"
              {...stylex.props(styles.search)}
            />
            <Combobox.Empty {...stylex.props(styles.empty)}>
              <span {...stylex.props(styles.emptyText)}>No example matches.</span>
            </Combobox.Empty>
            <Combobox.List>
              {(group: { value: string; items: PickerItem[] }) => (
                <Combobox.Group
                  key={group.value}
                  items={group.items}
                  {...stylex.props(styles.group)}
                >
                  <Combobox.GroupLabel {...stylex.props(styles.groupLabel)}>
                    {group.value}
                  </Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(item: PickerItem) => (
                      <Combobox.Item
                        key={item.value}
                        value={item}
                        className={(state) =>
                          stylex.props(styles.item, state.highlighted && styles.itemHighlighted)
                            .className ?? ""
                        }
                      >
                        <Combobox.ItemIndicator {...stylex.props(styles.check)}>
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
                        </Combobox.ItemIndicator>
                        <span {...stylex.props(styles.itemText)}>{item.label}</span>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
