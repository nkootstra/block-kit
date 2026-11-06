import type { IconButton as IconButtonElement } from "@slack/types";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import {
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  KebabIcon,
  TrashIcon,
  WorkflowIcon,
} from "../icons";
import { Tooltip } from "../Tooltip";
import type { ElementProps } from "../types";
import { asObject, asString } from "../payloadValues";

/** Slack's icon names we can approximate with our inline set; unknown icons fall back to a
 * generic glyph rather than rendering nothing. */
const ICONS: Record<string, typeof TrashIcon> = {
  trash: TrashIcon,
  delete: TrashIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  time: ClockIcon,
  "external-link": ExternalLinkIcon,
  link: ExternalLinkIcon,
  workflow: WorkflowIcon,
  more: KebabIcon,
  "chevron-down": ChevronDownIcon,
};

export function IconButton({ element, blockId }: ElementProps<IconButtonElement>) {
  const { dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  // Own keys only: "constructor" would find a function on Object.prototype. Not `own()`, which the
  // static-components lint reads as a component created during render.
  const Icon =
    (typeof element.icon === "string" && Object.hasOwn(ICONS, element.icon)
      ? ICONS[element.icon]
      : undefined) ?? KebabIcon;
  const label = asString(asObject(element.text)?.text);

  async function onClick() {
    if (!(await ask())) return;
    dispatch({
      type: "icon_button",
      action_id: element.action_id ?? "",
      block_id: blockId,
      ...(element.value !== undefined ? { value: element.value } : {}),
      // Slack echoes the button's icon and text.
      icon: element.icon,
      text: element.text,
    });
  }

  return (
    <>
      <Tooltip label={label}>
        <button
          type="button"
          className="sbk-icon-button"
          onClick={onClick}
          aria-label={element.accessibility_label ?? label}
        >
          <Icon />
        </button>
      </Tooltip>
      {dialog}
    </>
  );
}
