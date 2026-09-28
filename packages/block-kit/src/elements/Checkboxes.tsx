import type { Checkboxes as CheckboxesElement, Option } from "@slack/types";
import { useEffect, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { Text } from "../Text";
import type { ElementProps } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";

/** Two options are "the same" option when their values match, as Slack compares them. */
function sameOption(a: Option, b: Option) {
  return a.value === b.value;
}

export function Checkboxes({ element, blockId }: ElementProps<CheckboxesElement>) {
  const { setValue, dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const [selected, setSelected] = useState<Option[]>(element.initial_options ?? []);
  const actionId = element.action_id ?? "";
  const focusRef = useFocusOnLoad<HTMLInputElement>(element);

  useEffect(() => {
    setValue(blockId, actionId, { type: "checkboxes", selected_options: selected });
    // Only on mount: report the initial value, exactly like Slack does when the surface loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (option: Option) => {
    const isSelected = selected.some((o) => sameOption(o, option));
    if (!isSelected && !(await ask())) return;
    const next = isSelected
      ? selected.filter((o) => !sameOption(o, option))
      : [...selected, option];
    setSelected(next);
    setValue(blockId, actionId, { type: "checkboxes", selected_options: next });
    dispatch({
      type: "checkboxes",
      action_id: actionId,
      block_id: blockId,
      selected_options: next,
    });
  };

  return (
    <div className="sbk-checkboxes" role="group">
      {element.options.map((option, i) => {
        const checked = selected.some((o) => sameOption(o, option));
        return (
          <label className="sbk-checkboxes__option" key={option.value ?? i}>
            <input
              ref={i === 0 ? focusRef : undefined}
              type="checkbox"
              className="sbk-checkboxes__input"
              checked={checked}
              onChange={() => toggle(option)}
            />
            <span className="sbk-checkboxes__body">
              <span className="sbk-checkboxes__text">
                <Text text={option.text} />
              </span>
              {option.description && (
                <span className="sbk-checkboxes__description">
                  <Text text={option.description} />
                </span>
              )}
            </span>
          </label>
        );
      })}
      {dialog}
    </div>
  );
}
