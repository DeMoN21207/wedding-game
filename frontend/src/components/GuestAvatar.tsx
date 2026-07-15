import { memo } from "react";
import { initials } from "../utils/format";
import { guestAvatarUrl } from "../utils/guestAvatars";

type GuestAvatarProps = {
  avatarIndex?: number | null;
  className?: string;
  nickname: string;
  seed?: string;
};

/**
 * Круглый аватар гостя с fallback на инициалы для старых или битых данных.
 */
export const GuestAvatar = memo(function GuestAvatar({ avatarIndex, className = "guest-avatar", nickname, seed }: GuestAvatarProps) {
  const avatarUrl = guestAvatarUrl(avatarIndex, seed ?? nickname);

  return (
    <span className={className} aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" decoding="async" loading="lazy" /> : initials(nickname)}
    </span>
  );
});
