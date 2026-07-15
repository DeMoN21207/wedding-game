import { Heart } from "lucide-react";
import { memo } from "react";

type LockedUploadPanelProps = {
  onShowIntro: () => void;
};

/**
 * Показывает гостю понятный вход перед первой загрузкой фото.
 */
export const LockedUploadPanel = memo(function LockedUploadPanel({ onShowIntro }: LockedUploadPanelProps) {
  return (
    <section className="upload-panel upload-panel-hero upload-panel-locked">
      <div className="locked-upload-content">
        <div className="hero-action-icon hero-action-icon-gold" aria-hidden="true">
          <Heart size={72} strokeWidth={2.1} />
        </div>
        <h2>Давай поздороваемся</h2>
        <p>Придумайте ник, и ваши фото попадут в общий альбом.</p>
        <button className="hero-action-button hero-action-button-gold" onClick={onShowIntro}>
          <span>Войти в альбом</span>
        </button>
      </div>
    </section>
  );
});
