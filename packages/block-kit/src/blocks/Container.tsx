import { useState } from "react";
import { Text, type TextObject } from "../Text";
import type { BlockProps, Json } from "../types";
import { Block } from "./Block";
import { InContainerContext } from "./containerContext";

function ChevronDown() {
  return (
    <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
      <path
        d="M3 5.5l4.5 4.5 4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WIDTHS = ["narrow", "standard", "wide", "full"];

/**
 * A bordered, optionally-collapsible group of child blocks with a header (icon/title/subtitle).
 * `width` caps the card (narrow/standard/wide); `full` spans the whole message column.
 */
export function Container({ block }: BlockProps) {
  const json = block as Json;
  const title = json.title as TextObject | undefined;
  const subtitle = json.subtitle as TextObject | undefined;
  const icon = json.icon as Json | undefined;
  const isCollapsible = json.is_collapsible === true;
  const width = WIDTHS.includes(json.width as string) ? (json.width as string) : "standard";
  const hasHeaderDivider = json.has_header_divider === true;
  const children = (json.child_blocks as Json[] | undefined) ?? [];
  const [collapsed, setCollapsed] = useState(isCollapsible && json.default_collapsed === true);

  const hasHeader = Boolean(title || subtitle || icon || isCollapsible);

  const header = hasHeader && (
    <div className="sbk-container__titles">
      {icon && (
        <img
          className="sbk-container__icon"
          src={"image_url" in icon ? (icon.image_url as string) : undefined}
          alt={(icon.alt_text as string) ?? ""}
        />
      )}
      <div className="sbk-container__title-col">
        {title && (
          <span className="sbk-container__title">
            <Text text={title} />
          </span>
        )}
        {subtitle && (
          <span className="sbk-container__subtitle">
            <Text text={subtitle} />
          </span>
        )}
      </div>
      {isCollapsible && (
        <span
          className={`sbk-container__chevron${collapsed ? " sbk-container__chevron--collapsed" : ""}`}
        >
          <ChevronDown />
        </span>
      )}
    </div>
  );

  return (
    <div className={`sbk-container sbk-container--${width}`}>
      {isCollapsible ? (
        <button
          type="button"
          className="sbk-container__header sbk-container__header--button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          {header}
        </button>
      ) : (
        hasHeader && (
          <div
            className={`sbk-container__header${hasHeaderDivider ? " sbk-container__header--divider" : ""}`}
          >
            {header}
          </div>
        )
      )}
      {!collapsed && (
        <div className="sbk-container__body">
          <InContainerContext.Provider value={true}>
            {children.map((child, i) => (
              <Block key={(child.block_id as string | undefined) ?? i} block={child} index={i} />
            ))}
          </InContainerContext.Provider>
        </div>
      )}
    </div>
  );
}
