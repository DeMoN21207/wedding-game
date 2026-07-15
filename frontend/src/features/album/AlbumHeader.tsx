import { Heart, LogOut, UserRound } from "lucide-react";
import { memo } from "react";
import type { Me } from "../../api/client";
import { GuestAvatar } from "../../components/GuestAvatar";
import { appConfig } from "../../config/appConfig";

type AlbumHeaderProps = {
  me: Me | null;
  onLogout: () => void;
  onShowIntro: () => void;
};

/**
 * Верхняя панель гостевой страницы с названием альбома и текущим гостем.
 */
export const AlbumHeader = memo(function AlbumHeader({ me, onLogout, onShowIntro }: AlbumHeaderProps) {
  return (
    <header className="album-redesign-nav">
      <div className="album-brand">
        <span className="album-logo-placeholder" aria-hidden="true">
          <Heart size={30} />
        </span>
        <span>{appConfig.albumTitle}</span>
      </div>
      <div className="album-nav-actions">
        {me ? (
          <button className="guest-session-pill album-user-pill" title="Выйти" onClick={onLogout}>
            <GuestAvatar avatarIndex={me.avatar_index} className="guest-session-avatar" nickname={me.nickname} seed={me.slug} />
            <span className="guest-session-name">{me.nickname}</span>
            <LogOut size={17} />
          </button>
        ) : (
          <button className="guest-session-pill album-user-pill" title="Войти" onClick={onShowIntro}>
            <span className="guest-session-avatar">?</span>
            <span className="guest-session-name">Гость</span>
            <UserRound size={17} />
          </button>
        )}
      </div>
    </header>
  );
});
