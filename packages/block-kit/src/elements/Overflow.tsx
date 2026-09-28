import type { Overflow as OverflowElement, PlainTextOption } from "@slack/types";
import { useRef, useState } from "react";
import { useConfirm } from "../confirm/useConfirm";
import { useBlockKit } from "../context";
import { KebabIcon } from "../icons";
import type { ElementProps } from "../types";
import { useMenuNavigation } from "./useMenuNavigation";
import { Popover } from "./Popover";

export function Overflow({ element, blockId }: ElementProps<OverflowElement>) {
  const { dispatch } = useBlockKit();
  const { ask, dialog } = useConfirm(element.confirm);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const actionId = element.action_id ?? "";

  async function choose(option: PlainTextOption) {
    if (!(await ask())) return;
    setOpen(false);
    dispatch({
      type: "overflow",
      action_id: actionId,
      block_id: blockId,
      selected_option: option,
    });
    if (option.url) window.open(option.url, "_blank", "noopener,noreferrer");
  }

  const nav = useMenuNavigation({
    open,
    count: element.options.length,
    onChoose: (i) => {
      const option = element.options[i];
      if (option) choose(option);
    },
    onClose: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
    onOpen: () => setOpen(true),
    listRef,
  });

  return (
    <div className="sbk-overflow" ref={rootRef} onKeyDown={nav.onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="sbk-overflow__button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
      >
        <KebabIcon />
      </button>
      {open && (
        <Popover anchorRef={rootRef} onDismiss={() => setOpen(false)}>
          <div className="sbk-overflow__menu" role="menu" ref={listRef}>
            {element.options.map((option, i) => (
              <div
                key={option.value ?? i}
                role="menuitem"
                className="sbk-overflow__option"
                onClick={() => choose(option)}
                {...nav.itemProps(i)}
              >
                {option.text.text}
              </div>
            ))}
          </div>
        </Popover>
      )}
      {dialog}
    </div>
  );
}
