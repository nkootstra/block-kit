import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockKit } from "./context";
import { Emoji } from "./emoji";

export interface UserMentionProps {
  /** Slack user id, e.g. `U0123ABC`. */
  id: string;
  /** Display name, rendered as `@name`. */
  name: string;
}

function localTime(timeZone: string): string | undefined {
  try {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    return undefined;
  }
}

/**
 * A resolved `@user` mention. Clicking it (or Enter/Space when focused) opens a profile card like
 * Slack's `p-member_profile_card` popover: avatar, names, title, status and local time, filled from
 * `resolvers.userProfile` and falling back to the display name alone.
 */
export function UserMention({ id, name }: UserMentionProps) {
  const { resolvers } = useBlockKit();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current?.getBoundingClientRect();
    const card = cardRef.current?.getBoundingClientRect();
    if (!anchor || !card) return;
    const gap = 4;
    const below = anchor.bottom + gap;
    const top =
      below + card.height <= window.innerHeight || anchor.top - gap - card.height < 0
        ? below
        : anchor.top - gap - card.height;
    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - card.width - 8);
    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || cardRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((o) => !o);
    }
  }

  const profile = open ? (resolvers.userProfile?.(id) ?? { name }) : undefined;
  const time = profile?.timeZone ? localTime(profile.timeZone) : undefined;

  return (
    <>
      <span
        ref={anchorRef}
        className="sbk-mention sbk-mention--user"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        @{name}
      </span>
      {profile &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cardRef}
            id={cardId}
            role="dialog"
            aria-label={profile.name}
            className="sbk-root sbk-profile-card"
            style={
              position
                ? { top: position.top, left: position.left }
                : { top: 0, left: 0, visibility: "hidden" }
            }
          >
            {profile.avatarUrl ? (
              <img className="sbk-profile-card__avatar" src={profile.avatarUrl} alt="" />
            ) : (
              <span
                className="sbk-profile-card__avatar sbk-profile-card__avatar--placeholder"
                aria-hidden="true"
              >
                {profile.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="sbk-profile-card__body">
              <div className="sbk-profile-card__name">
                {profile.name}
                {profile.pronouns && (
                  <span className="sbk-profile-card__pronouns">{profile.pronouns}</span>
                )}
              </div>
              {profile.realName && profile.realName !== profile.name && (
                <div className="sbk-profile-card__secondary">{profile.realName}</div>
              )}
              {profile.title && <div className="sbk-profile-card__secondary">{profile.title}</div>}
              {profile.status && (profile.status.emoji || profile.status.text) && (
                <div className="sbk-profile-card__status">
                  {profile.status.emoji && <Emoji name={profile.status.emoji} size={16} />}
                  {profile.status.text}
                </div>
              )}
              {time && <div className="sbk-profile-card__time">{time} local time</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
