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
  const Icon = ICONS[element.icon] ?? KebabIcon;

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
      <Tooltip label={element.text.text}>
        <button
          type="button"
          className="sbk-icon-button"
          onClick={onClick}
          aria-label={element.accessibility_label ?? element.text.text}
        >
          <Icon />
        </button>
      </Tooltip>
      {dialog}
    </>
  );
}
