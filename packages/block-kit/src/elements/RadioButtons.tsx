import type { Option, RadioButtons as RadioButtonsElement } from "@slack/types";
import { useEffect, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { Text } from "../Text";
import type { ElementProps } from "../types";
import { useFocusOnLoad } from "./useFocusOnLoad";

export function RadioButtons({ element, blockId }: ElementProps<RadioButtonsElement>) {
  const { setValue, dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const [selected, setSelected] = useState<Option | undefined>(element.initial_option);
  const actionId = element.action_id ?? "";
  const focusRef = useFocusOnLoad<HTMLInputElement>(element);

  useEffect(() => {
    if (selected) setValue(blockId, actionId, { type: "radio_buttons", selected_option: selected });
    // Only on mount: report the initial value, exactly like Slack does when the surface loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = async (option: Option) => {
    if (option.value === selected?.value) return;
    if (!(await ask())) return;
    setSelected(option);
    setValue(blockId, actionId, { type: "radio_buttons", selected_option: option });
    dispatch({
      type: "radio_buttons",
      action_id: actionId,
      block_id: blockId,
      selected_option: option,
      // Slack echoes the element's initial_option back in the action.
      ...(element.initial_option !== undefined ? { initial_option: element.initial_option } : {}),
    });
  };

  return (
    <div className="sbk-radio-buttons" role="radiogroup">
      {element.options.map((option, i) => (
        <label className="sbk-radio-buttons__option" key={option.value ?? i}>
          <input
            ref={i === 0 ? focusRef : undefined}
            type="radio"
            className="sbk-radio-buttons__input"
            name={`${blockId}-${actionId}`}
            checked={option.value === selected?.value}
            onChange={() => select(option)}
          />
          <span className="sbk-radio-buttons__body">
            <span className="sbk-radio-buttons__text">
              <Text text={option.text} />
            </span>
            {option.description && (
              <span className="sbk-radio-buttons__description">
                <Text text={option.description} />
              </span>
            )}
          </span>
        </label>
      ))}
      {dialog}
    </div>
  );
}
